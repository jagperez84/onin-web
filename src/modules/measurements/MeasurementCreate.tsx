import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, MapPin, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  createMeasurement,
  type AssignedMode,
  type MeasurementStatus,
} from "../../services/measurements/measurementRepository";
import {
  listMeasurementUsers,
  type UserAccount,
} from "../../services/core/userRepository";
import { AddressLookup } from "../customers/AddressLookup";
import type { AddressForm } from "../customers/types";
import { MessageLog } from "../../components/ui/MessageLog";
import { CustomerMeasurementLookup } from "./CustomerMeasurementLookup";
import "./measurements.css";

type CustomerOption = {
  id: number;
  party: {
    legal_name: string;
    trade_name: string | null;
    tax_id: string | null;
    code: string | null;
    phone: string | null;
    email: string | null;
  };
};
const emptyAddress: AddressForm = {
  address_type: "INSTALACION",
  street: "",
  postal_code: "",
  city: "",
  region: "",
  country_code: "ES",
};
function normalizePhone(value: string) {
  return value.trim().replace(/[\s().-]/g, "");
}
function isValidSpanishPhone(value: string) {
  const p = normalizePhone(value);
  if (!p) return true;
  const local = p.startsWith("+34") ? p.slice(3) : p;
  return /^[6789]\d{8}$/.test(local);
}
function phoneError(label: string, value: string) {
  return value.trim() && !isValidSpanishPhone(value)
    ? `${label} debe tener un formato telefónico válido.`
    : "";
}

export function MeasurementCreate() {
  const navigate = useNavigate();
  const logRef = useRef<HTMLDivElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [measurers, setMeasurers] = useState<
    Pick<
      UserAccount,
      "auth_user_id" | "username" | "display_name" | "role_code" | "can_measure"
    >[]
  >([]);
  const [customer, setCustomer] = useState<CustomerOption | null>(null);
  const [address, setAddress] = useState<AddressForm>(emptyAddress);
  const [contact, setContact] = useState({
    name: "",
    phone: "",
    mobile: "",
    email: "",
  });
  const [form, setForm] = useState({
    reference: "",
    contact_method: "",
    commercial_name: "",
    assigned_mode: "UNASSIGNED" as AssignedMode,
    assigned_user_id: "",
    contact_date: new Date().toISOString().slice(0, 10),
    measurement_date: "",
    measurement_time: "",
    observations: "",
  });
  useEffect(() => {
    listMeasurementUsers(null)
      .then(setMeasurers)
      .catch(() => setMeasurers([]));
  }, []);
  function reportError(value: string) {
    setError(value);
    requestAnimationFrame(() => logRef.current?.focus());
  }
  function updateContact(key: keyof typeof contact, value: string) {
    setContact((v) => ({ ...v, [key]: value }));
  }
  function selectCustomer(selection: CustomerOption | null) {
    setCustomer(selection);
    if (!selection) {
      setContact({ name: "", phone: "", mobile: "", email: "" });
      return;
    }
    const p = selection.party;
    setContact({
      name: p.trade_name || p.legal_name,
      phone: p.phone || "",
      mobile: "",
      email: p.email || "",
    });
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!contact.name.trim()) {
      reportError("El nombre del contacto es obligatorio.");
      return;
    }
    if (!form.contact_date) {
      reportError("La fecha de contacto es obligatoria.");
      return;
    }
    const phoneValidation =
      phoneError("El teléfono", contact.phone) ||
      phoneError("El móvil", contact.mobile);
    if (phoneValidation) {
      reportError(phoneValidation);
      return;
    }
    if (form.assigned_mode === "USER" && !form.assigned_user_id) {
      reportError("Debe seleccionar el medidor.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const id = await createMeasurement(null, {
        reference: form.reference || null,
        customer_id: customer?.id ?? null,
        customer_name_snapshot: contact.name.trim(),
        customer_tax_id_snapshot: null,
        customer_phone_snapshot: normalizePhone(contact.phone) || null,
        customer_mobile_snapshot: normalizePhone(contact.mobile) || null,
        customer_email_snapshot: contact.email.trim() || null,
        site_street: address.street || null,
        site_postal_code: address.postal_code || null,
        site_city: address.city || null,
        site_region: address.region || null,
        site_country_code: address.country_code || "ES",
        site_latitude: null,
        site_longitude: null,
        zone_id: null,
        contact_method: form.contact_method || null,
        commercial_name: form.commercial_name || null,
        assigned_user_id: form.assigned_user_id || null,
        assigned_mode: form.assigned_mode,
        status: "PLANNED" as MeasurementStatus,
        contact_date: form.contact_date,
        measurement_date: form.measurement_date || null,
        measurement_time: form.measurement_time || null,
        reference_note: null,
        observations: form.observations || null,
      });
      navigate(`/gestion/mediciones/${id}`);
    } catch (e) {
      reportError(
        e instanceof Error ? e.message : "No se pudo crear la medición.",
      );
    } finally {
      setSaving(false);
    }
  }
  const hasCustomer = !!customer;
  return (
    <div className="module-page measurement-detail-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">GESTIÓN / MEDICIONES / NUEVA</div>
          <h1>Nueva medición</h1>
          <p>
            Crea el expediente con número automático y conserva el contexto de
            la visita.
          </p>
        </div>
      </div>
      <MessageLog ref={logRef} error={error} />
      <form onSubmit={save} className="measurement-main">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Identificación</h2>
              <p>El número definitivo lo asigna el sistema al guardar.</p>
            </div>
            <Save size={19} />
          </div>
          <div className="form-grid">
            <label>
              Referencia
              <input
                value={form.reference}
                onChange={(e) =>
                  setForm({ ...form, reference: e.target.value })
                }
                placeholder="Referencia de cliente, obra…"
              />
            </label>
            <label>
              Forma de contacto
              <select
                value={form.contact_method}
                onChange={(e) =>
                  setForm({ ...form, contact_method: e.target.value })
                }
              >
                <option value="">Seleccionar…</option>
                <option>Recomendado</option>
                <option>Teléfono</option>
                <option>Visita oficina</option>
                <option>Email</option>
                <option>Comerciales</option>
                <option>Presupuesto on-line</option>
              </select>
            </label>
            <label className="wide">
              Cliente (opcional)
              <CustomerMeasurementLookup
                value={customer?.id ?? null}
                selectedLabel={
                  customer?.party.trade_name || customer?.party.legal_name || ""
                }
                onChange={selectCustomer}
              />
            </label>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Datos de Contacto</h2>
              <p>
                Puede ser un cliente existente o un cliente potencial. Si no
                seleccionas un cliente, introduce aquí sus datos.
              </p>
            </div>
          </div>
          <div className="form-grid contact-data-grid create-contact-data-grid">
            <label>
              Nombre *
              <input
                value={contact.name}
                readOnly={hasCustomer}
                onChange={(e) => updateContact("name", e.target.value)}
              />
            </label>
            <label>
              Teléfono
              <input
                value={contact.phone}
                readOnly={hasCustomer}
                inputMode="tel"
                autoComplete="tel"
                onChange={(e) => updateContact("phone", e.target.value)}
                placeholder="600 000 000"
              />
            </label>
            <label>
              Móvil
              <input
                value={contact.mobile}
                readOnly={hasCustomer}
                inputMode="tel"
                autoComplete="tel-national"
                onChange={(e) => updateContact("mobile", e.target.value)}
                placeholder="600 000 000"
              />
            </label>
            <label className="wide">
              Email
              <input
                type="email"
                value={contact.email}
                readOnly={hasCustomer}
                onChange={(e) => updateContact("email", e.target.value)}
              />
            </label>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Ubicación de la medición</h2>
              <p>
                La dirección se puede localizar mediante la API de direcciones,
                igual que en Clientes.
              </p>
            </div>
            <MapPin size={19} />
          </div>
          <div className="form-grid measurement-address-grid">
            <AddressLookup value={address} onChange={setAddress} />
            <label className="measurement-address-wide">
              Dirección
              <input
                value={address.street}
                onChange={(e) =>
                  setAddress((v) => ({ ...v, street: e.target.value }))
                }
              />
            </label>
            <label>
              Código Postal
              <input
                value={address.postal_code}
                onChange={(e) =>
                  setAddress((v) => ({ ...v, postal_code: e.target.value }))
                }
              />
            </label>
            <label>
              Localidad
              <input
                value={address.city}
                onChange={(e) =>
                  setAddress((v) => ({ ...v, city: e.target.value }))
                }
              />
            </label>
            <label>
              Provincia
              <input
                value={address.region}
                onChange={(e) =>
                  setAddress((v) => ({ ...v, region: e.target.value }))
                }
              />
            </label>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Agenda y medidor</h2>
              <p>
                La asignación se realiza seleccionando un usuario habilitado
                para medir.
              </p>
            </div>
            <CalendarDays size={19} />
          </div>
          <div className="form-grid">
            <label>
              Fecha de contacto
              <input
                type="date"
                value={form.contact_date}
                onChange={(e) =>
                  setForm({ ...form, contact_date: e.target.value })
                }
              />
            </label>
            <label>
              Fecha prevista
              <input
                type="date"
                value={form.measurement_date}
                onChange={(e) =>
                  setForm({ ...form, measurement_date: e.target.value })
                }
              />
            </label>
            <label>
              Hora
              <input
                type="time"
                value={form.measurement_time}
                onChange={(e) =>
                  setForm({ ...form, measurement_time: e.target.value })
                }
              />
            </label>
            <label>
              Medidor
              <select
                value={form.assigned_user_id}
                onChange={(e) =>
                  setForm({
                    ...form,
                    assigned_user_id: e.target.value,
                    assigned_mode: e.target.value ? "USER" : "UNASSIGNED",
                  })
                }
              >
                <option value="">Sin asignar</option>
                {measurers.map((m) => (
                  <option key={m.auth_user_id} value={m.auth_user_id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Comercial
              <input
                value={form.commercial_name}
                onChange={(e) =>
                  setForm({ ...form, commercial_name: e.target.value })
                }
                placeholder="Opcional"
              />
            </label>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Observaciones</h2>
              <p>Información inicial del expediente.</p>
            </div>
          </div>
          <label className="measurement-observations">
            <textarea
              rows={7}
              value={form.observations}
              onChange={(e) =>
                setForm({ ...form, observations: e.target.value })
              }
              placeholder="Acceso, detalles de la visita, incidencias…"
            />
          </label>
        </section>
        <div className="measurement-save-bar">
          <button
            type="button"
            className="secondary-button"
            onClick={() => navigate("/gestion/mediciones")}
          >
            <ArrowLeft size={15} /> Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Creando expediente…" : "Crear medición"}
          </button>
        </div>
      </form>
    </div>
  );
}
