import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MapPin, Plus, Trash2, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getActiveCompanies } from "../../services/core/coreRepository";
import {
  createAddress,
  createContact,
  createCustomer,
  getCustomerDetails,
} from "../../services/core/customerRepository";
import type { AddressForm, ContactForm, CustomerForm } from "./types";
import {
  validateEmail,
  validatePhone,
  validateSpanishTaxId,
} from "./validation";
import { COUNTRY_OPTIONS, getCountryName } from "./addressUtils";
import { AddressLookup } from "./AddressLookup";
import { MessageLog } from "../../components/ui/MessageLog";
import { ProfileSaveBar } from "../../components/ui/ProfileSaveBar";
import { supabase } from "../../lib/supabase";

const emptyAddress: AddressForm = {
  address_type: "FISCAL",
  street: "",
  postal_code: "",
  city: "",
  region: "",
  country_code: "ES",
};
const emptyContact: ContactForm = {
  first_name: "",
  last_name: "",
  job_title: "",
  department: "",
  phone: "",
  mobile: "",
  email: "",
  notes: "",
  active: true,
};

export function CustomerCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const quotationId = Number(searchParams.get("quotationId"));
  const fromQuotation = Number.isFinite(quotationId) && quotationId > 0;
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerForm>({
    legal_name: "",
    trade_name: "",
    tax_id: "",
    email: "",
    phone: "",
    active: true,
    notes: "",
  });
  const [addresses, setAddresses] = useState<AddressForm[]>([]);
  const [contacts, setContacts] = useState<ContactForm[]>([]);
  const [address, setAddress] = useState<AddressForm>(emptyAddress);
  const [contact, setContact] = useState<ContactForm>(emptyContact);
  const [showAddress, setShowAddress] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    getActiveCompanies()
      .then((cs) => setCompanyId(cs[0]?.id ?? null))
      .catch((e) =>
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo obtener la empresa activa.",
        ),
      );
  }, []);

  useEffect(() => {
    if (!fromQuotation || !supabase) return;
    let active = true;
    void supabase
      .from("quotation")
      .select("contact_name,contact_email,contact_phone,installation_address_street,installation_address_postal_code,installation_address_city,installation_address_region")
      .eq("id", quotationId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        const fullName = String(data.contact_name ?? "").trim();
        const parts = fullName.split(/\s+/).filter(Boolean);
        setForm((current) => ({
          ...current,
          legal_name: current.legal_name || fullName,
          trade_name: current.trade_name || fullName,
          email: current.email || String(data.contact_email ?? ""),
          phone: current.phone || String(data.contact_phone ?? ""),
        }));
        if (fullName && contacts.length === 0) {
          setContacts([{
            ...emptyContact,
            first_name: parts.shift() ?? "",
            last_name: parts.join(" "),
            email: String(data.contact_email ?? ""),
            phone: String(data.contact_phone ?? ""),
          }]);
        }
        const street = String(data.installation_address_street ?? "");
        const city = String(data.installation_address_city ?? "");
        if ((street || city) && addresses.length === 0) {
          setAddresses([{
            ...emptyAddress,
            address_type: "INSTALACION",
            street,
            postal_code: String(data.installation_address_postal_code ?? ""),
            city,
            region: String(data.installation_address_region ?? ""),
          }]);
        }
      });
    return () => { active = false; };
  }, [fromQuotation, quotationId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errors = [
      validateSpanishTaxId(form.tax_id),
      validateEmail(form.email),
      validatePhone(form.phone),
    ].filter(Boolean) as string[];
    if (!form.legal_name.trim())
      errors.unshift("La razón social es obligatoria.");
    if (!companyId) errors.unshift("No hay una empresa activa configurada.");
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = await createCustomer(form, companyId!);
      const d = await getCustomerDetails(id);
      await Promise.all(addresses.map((a) => createAddress(d.party.id, a)));
      await Promise.all(contacts.map((c) => createContact(d.party.id, c)));
      if (fromQuotation) {
        if (!supabase) throw new Error("Supabase no está configurado.");
        const { error: quotationError } = await supabase
          .from("quotation")
          .update({ customer_id: id, updated_at: new Date().toISOString() })
          .eq("id", quotationId);
        if (quotationError) throw new Error(`Cliente creado, pero no se pudo asociar al presupuesto: ${quotationError.message}`);
        navigate(`/ventas/presupuestos/${quotationId}`);
      } else {
        navigate(`/ventas/clientes/${id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el cliente.");
    } finally {
      setSaving(false);
    }
  }
  function addAddress() {
    const street = String(address.street ?? "");
    const city = String(address.city ?? "");
    if (!street.trim() && !city.trim()) {
      setError("Introduce al menos la dirección o la localidad.");
      return;
    }
    setAddresses([...addresses, { ...address, street, city }]);
    setAddress({ ...emptyAddress });
    setShowAddress(false);
    setError("");
  }
  function addContact() {
    const firstName = String(contact.first_name ?? "");
    const lastName = String(contact.last_name ?? "");
    if (!firstName.trim() && !lastName.trim()) {
      setError("Introduce el nombre o apellido del contacto.");
      return;
    }
    const ee = validateEmail(String(contact.email ?? ""));
    const pe = validatePhone(String(contact.phone ?? ""));
    if (ee || pe) {
      setError(ee || pe || "Datos del contacto no válidos.");
      return;
    }
    setContacts([
      ...contacts,
      { ...contact, first_name: firstName, last_name: lastName },
    ]);
    setContact({ ...emptyContact });
    setShowContact(false);
    setError("");
  }
  return (
    <div className="module-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">VENTAS / CLIENTES / NUEVO</div>
          <h1>Nuevo cliente</h1>
          <p>Alta de cliente con ID generado automáticamente.</p>
          {fromQuotation && (
            <p style={{ marginTop: "6px", color: "#2563eb", fontWeight: 600 }}>
              Datos precargados desde el presupuesto. Completa los datos fiscales y confirma el alta.
            </p>
          )}
        </div>
        <Link className="secondary-button" to="/ventas/clientes">
          ← Volver al listado
        </Link>
      </div>
      <MessageLog error={error} />
      <form id="customer-create-form" className="detail-grid" onSubmit={submit}>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Datos generales</h2>
              <p>El código y el ID se generan automáticamente.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Razón social *
              <input
                autoFocus
                value={form.legal_name}
                onChange={(e) =>
                  setForm({ ...form, legal_name: e.target.value })
                }
                maxLength={200}
              />
            </label>
            <label>
              Nombre comercial
              <input
                value={form.trade_name}
                onChange={(e) =>
                  setForm({ ...form, trade_name: e.target.value })
                }
                maxLength={200}
              />
            </label>
            <label>
              CIF/NIF *
              <input
                value={form.tax_id}
                onChange={(e) =>
                  setForm({ ...form, tax_id: e.target.value.toUpperCase() })
                }
                maxLength={32}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                maxLength={254}
              />
            </label>
            <label>
              Teléfono
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                maxLength={40}
              />
            </label>
            <label>
              Estado
              <select
                value={form.active ? "1" : "0"}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.value === "1" })
                }
              >
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </label>
            <label className="wide">
              Observaciones
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Direcciones</h2>
              <p>Puedes añadirlas durante el alta o después.</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowAddress(true)}
            >
              <Plus size={15} /> Añadir dirección
            </button>
          </div>
          <div className="nested-list">
            {addresses.length === 0 ? (
              <div className="empty-substate">
                <MapPin size={22} />
                No hay direcciones añadidas.
              </div>
            ) : (
              addresses.map((a, i) => (
                <div className="nested-item" key={i}>
                  <div>
                    <strong>{a.address_type}</strong>
                    <span>
                      {[a.street, a.postal_code, a.city, a.region]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setAddresses(addresses.filter((_, n) => n !== i))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
          {showAddress && (
            <AddressEditor
              value={address}
              onChange={setAddress}
              onCancel={() => setShowAddress(false)}
              onSave={addAddress}
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Contactos</h2>
              <p>Personas de contacto del cliente.</p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowContact(true)}
            >
              <Plus size={15} /> Añadir contacto
            </button>
          </div>
          <div className="nested-list">
            {contacts.length === 0 ? (
              <div className="empty-substate">
                <UserRound size={22} />
                No hay contactos añadidos.
              </div>
            ) : (
              contacts.map((c, i) => (
                <div className="nested-item" key={i}>
                  <div>
                    <strong>
                      {[c.first_name, c.last_name].filter(Boolean).join(" ")}
                    </strong>
                    <span>
                      {[c.job_title, c.phone, c.email]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setContacts(contacts.filter((_, n) => n !== i))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
          {showContact && (
            <ContactEditor
              value={contact}
              onChange={setContact}
              onCancel={() => setShowContact(false)}
              onSave={addContact}
            />
          )}
        </section>
      </form>
      <ProfileSaveBar
        onSave={() => {
          const formElement = document.getElementById(
            "customer-create-form",
          ) as HTMLFormElement | null;
          formElement?.requestSubmit();
        }}
        saving={saving}
        label="Crear cliente"
      />
    </div>
  );
}
function AddressEditor({
  value,
  onChange,
  onCancel,
  onSave,
}: {
  value: AddressForm;
  onChange: (v: AddressForm) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const countryOptions = COUNTRY_OPTIONS.some(
    ([code]) => code === value.country_code,
  )
    ? COUNTRY_OPTIONS
    : [
        [value.country_code, getCountryName(value.country_code)],
        ...COUNTRY_OPTIONS,
      ];
  return (
    <div className="subform">
      <div className="form-grid address-editor-grid">
        <AddressLookup value={value} onChange={onChange} />
        <label>
          Tipo
          <select
            value={value.address_type}
            onChange={(e) =>
              onChange({ ...value, address_type: e.target.value })
            }
          >
            <option value="FISCAL">Fiscal</option>
            <option value="FACTURACION">Facturación</option>
            <option value="ALTERNATIVA">Alternativa</option>
            <option value="INSTALACION">Instalación</option>
          </select>
        </label>
        <label>
          País
          <select
            value={value.country_code}
            onChange={(e) =>
              onChange({ ...value, country_code: e.target.value })
            }
          >
            {countryOptions.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="wide">
          Dirección
          <input
            value={value.street}
            onChange={(e) => onChange({ ...value, street: e.target.value })}
          />
        </label>
        <label>
          Código postal
          <input
            value={value.postal_code}
            onChange={(e) =>
              onChange({ ...value, postal_code: e.target.value })
            }
          />
        </label>
        <label>
          Localidad
          <input
            value={value.city}
            onChange={(e) => onChange({ ...value, city: e.target.value })}
          />
        </label>
        <label className="wide">
          Provincia
          <input
            value={value.region}
            onChange={(e) => onChange({ ...value, region: e.target.value })}
          />
        </label>
      </div>
      <div className="actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="primary-button" onClick={onSave}>
          Añadir dirección
        </button>
      </div>
    </div>
  );
}
function ContactEditor({
  value,
  onChange,
  onCancel,
  onSave,
}: {
  value: ContactForm;
  onChange: (v: ContactForm) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="subform">
      <div className="form-grid">
        <label>
          Nombre
          <input
            value={value.first_name ?? ""}
            onChange={(e) => onChange({ ...value, first_name: e.target.value })}
          />
        </label>
        <label>
          Apellidos
          <input
            value={value.last_name ?? ""}
            onChange={(e) => onChange({ ...value, last_name: e.target.value })}
          />
        </label>
        <label>
          Cargo
          <input
            value={value.job_title ?? ""}
            onChange={(e) => onChange({ ...value, job_title: e.target.value })}
          />
        </label>
        <label>
          Departamento
          <input
            value={value.department ?? ""}
            onChange={(e) => onChange({ ...value, department: e.target.value })}
          />
        </label>
        <label>
          Teléfono
          <input
            type="tel"
            value={value.phone ?? ""}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
          />
        </label>
        <label>
          Móvil
          <input
            type="tel"
            value={value.mobile ?? ""}
            onChange={(e) => onChange({ ...value, mobile: e.target.value })}
          />
        </label>
        <label className="wide">
          Email
          <input
            type="email"
            value={value.email ?? ""}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
          />
        </label>
        <label className="wide">
          Observaciones
          <textarea
            value={value.notes ?? ""}
            onChange={(e) => onChange({ ...value, notes: e.target.value })}
          />
        </label>
      </div>
      <div className="actions">
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="primary-button" onClick={onSave}>
          Añadir contacto
        </button>
      </div>
    </div>
  );
}
