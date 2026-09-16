import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Ruler,
  User,
  XCircle,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getCustomerSummaries,
  getUserDisplayName,
} from "../../services/core/coreRepository";
import { EntitySearchField } from "../../components/ui/EntitySearchField";
import {
  createMeasurement,
  getMeasurement,
  getMeasurementLinkedQuotation,
  generateQuotationFromMeasurement,
  markMeasurementCancelled,
  updateMeasurement,
  type AssignedMode,
  type LinkedQuotationSummary,
  type Measurement,
  type MeasurementActivity,
  type MeasurementStatus,
} from "../../services/measurements/measurementRepository";
import {
  listMeasurementUsers,
  type UserAccount,
} from "../../services/core/userRepository";
import { useAuth } from "../../auth/AuthContext";
import { AddressLookup } from "../customers/AddressLookup";
import type { AddressForm } from "../customers/types";
import { MessageLog } from "../../components/ui/MessageLog";
import { MeasurementPhotos } from "./MeasurementPhotos";
import { MeasurementOpeningsSection } from "./MeasurementOpeningsSection";
import "./measurements.css";

const statusMeta: Record<MeasurementStatus, { label: string; next: string }> = {
  PLANNED: { label: "Planificada", next: "Asignar medidor" },
  ASSIGNED: { label: "Asignada", next: "Iniciar medición" },
  IN_PROGRESS: { label: "En curso", next: "Completar medición" },
  COMPLETED: { label: "Completada", next: "Generar presupuesto" },
  QUOTED: { label: "Presupuestada", next: "Seguimiento" },
  CLOSED: { label: "Cerrada", next: "Sin acciones" },
  CANCELLED: { label: "Cancelada", next: "Sin acciones" },
};
const emptyAddress: AddressForm = {
  address_type: "INSTALACION",
  street: "",
  postal_code: "",
  city: "",
  region: "",
  country_code: "ES",
};
function StatusBadge({ status }: { status: MeasurementStatus }) {
  return (
    <span className={`measurement-status ${status.toLowerCase()}`}>
      {statusMeta[status].label}
    </span>
  );
}
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "—";
}
function normalizePhone(value: string) {
  return value.trim().replace(/[\s().-]/g, "");
}
function isValidSpanishPhone(value: string) {
  const p = normalizePhone(value);
  if (!p) return true;
  const local = p.startsWith("+34") ? p.slice(3) : p;
  return /^[6789]\d{8}$/.test(local);
}
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

export function MeasurementDetail({
  measurementId: propId,
}: {
  measurementId?: number;
}) {
  const params = useParams<{ id: string }>();
  const measurementId = propId ?? Number(params.id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [activities, setActivities] = useState<MeasurementActivity[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [assignedUserName, setAssignedUserName] = useState<string | null>(null);
  const [measurers, setMeasurers] = useState<
    Pick<
      UserAccount,
      "auth_user_id" | "username" | "display_name" | "role_code" | "can_measure"
    >[]
  >([]);
  const [linkedQuotation, setLinkedQuotation] = useState<LinkedQuotationSummary | null>(null);
  const [draft, setDraft] = useState<Partial<Measurement>>({
    status: "PLANNED",
    assigned_mode: "UNASSIGNED",
    assigned_user_id: null,
    contact_date: new Date().toISOString().slice(0, 10),
    site_country_code: "ES",
  });
  const [address, setAddress] = useState<AddressForm>(emptyAddress);
  useEffect(() => {
    if (measurementId) load();
  }, [measurementId]);
  useEffect(() => {
    listMeasurementUsers(null)
      .then(setMeasurers)
      .catch(() => setMeasurers([]));
  }, []);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const d = await getMeasurement(measurementId);
      setMeasurement(d.measurement);
      setActivities(d.activities);
      setDraft(d.measurement);
      setCustomerSearch(d.measurement.customer_name_snapshot || "");
      setAddress({
        address_type: "INSTALACION",
        street: d.measurement.site_street ?? "",
        postal_code: d.measurement.site_postal_code ?? "",
        city: d.measurement.site_city ?? "",
        region: d.measurement.site_region ?? "",
        country_code: d.measurement.site_country_code || "ES",
      });
      setAssignedUserName(null);
      if (d.measurement.assigned_user_id) {
        try {
          setAssignedUserName(
            await getUserDisplayName(d.measurement.assigned_user_id),
          );
        } catch {
          setAssignedUserName(null);
        }
      }
      try {
        setLinkedQuotation(await getMeasurementLinkedQuotation(measurementId));
      } catch {
        setLinkedQuotation(null);
      }
      setEditing(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cargar el expediente.",
      );
    } finally {
      setLoading(false);
    }
  }
  function chooseCustomer(customer: CustomerOption) {
    const label = customer.party.trade_name || customer.party.legal_name;
    setDraft((v) => ({
      ...v,
      customer_id: customer.id,
      customer_name_snapshot: label,
      customer_tax_id_snapshot: customer.party.tax_id ?? null,
      customer_phone_snapshot: customer.party.phone ?? null,
      customer_email_snapshot: customer.party.email ?? null,
    }));
    setCustomerSearch(label);
  }
  function clearCustomer() {
    setDraft((v) => ({
      ...v,
      customer_id: null,
      customer_name_snapshot: null,
      customer_tax_id_snapshot: null,
      customer_phone_snapshot: null,
      customer_mobile_snapshot: null,
      customer_email_snapshot: null,
    }));
    setCustomerSearch("");
  }
  function update<K extends keyof Measurement>(key: K, value: Measurement[K]) {
    setDraft((v) => ({ ...v, [key]: value }));
  }
  function updateAddress(next: AddressForm) {
    setAddress(next);
    setDraft((v) => ({
      ...v,
      site_street: next.street,
      site_postal_code: next.postal_code,
      site_city: next.city,
      site_region: next.region,
      site_country_code: next.country_code,
    }));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!String(draft.customer_name_snapshot || "").trim()) {
      setError("Los datos de contacto son obligatorios.");
      return;
    }
    if (!draft.contact_date) {
      setError("La fecha de contacto es obligatoria.");
      return;
    }
    if (!isValidSpanishPhone(String(draft.customer_phone_snapshot || ""))) {
      setError("El teléfono debe tener un formato telefónico válido.");
      return;
    }
    if (!isValidSpanishPhone(String(draft.customer_mobile_snapshot || ""))) {
      setError("El móvil debe tener un formato telefónico válido.");
      return;
    }
    if (draft.assigned_mode === "USER" && !draft.assigned_user_id) {
      setError("Debe indicar el medidor asignado.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (measurementId === 0) {
        const id = await createMeasurement(null, {
          reference: draft.reference ?? null,
          customer_id: draft.customer_id ?? null,
          customer_name_snapshot: draft.customer_name_snapshot ?? null,
          customer_tax_id_snapshot: draft.customer_tax_id_snapshot ?? null,
          customer_phone_snapshot:
            normalizePhone(String(draft.customer_phone_snapshot || "")) || null,
          customer_mobile_snapshot:
            normalizePhone(String(draft.customer_mobile_snapshot || "")) ||
            null,
          customer_email_snapshot: draft.customer_email_snapshot ?? null,
          site_street: address.street || null,
          site_postal_code: address.postal_code || null,
          site_city: address.city || null,
          site_region: address.region || null,
          site_country_code: address.country_code || "ES",
          site_latitude: null,
          site_longitude: null,
          zone_id: null,
          contact_method: draft.contact_method ?? null,
          commercial_name: draft.commercial_name ?? null,
          assigned_user_id: draft.assigned_user_id ?? null,
          assigned_mode: (draft.assigned_mode ?? "UNASSIGNED") as AssignedMode,
          status: (draft.status ?? "PLANNED") as MeasurementStatus,
          contact_date: draft.contact_date!,
          measurement_date: draft.measurement_date ?? null,
          measurement_time: draft.measurement_time ?? null,
          reference_note: draft.reference_note ?? null,
          observations: draft.observations ?? null,
        });
        navigate(`/gestion/mediciones/${id}`);
      } else {
        await updateMeasurement(
          measurementId,
          {
            ...draft,
            customer_phone_snapshot:
              normalizePhone(String(draft.customer_phone_snapshot || "")) ||
              null,
            customer_mobile_snapshot:
              normalizePhone(String(draft.customer_mobile_snapshot || "")) ||
              null,
            site_street: address.street || null,
            site_postal_code: address.postal_code || null,
            site_city: address.city || null,
            site_region: address.region || null,
            site_country_code: address.country_code || "ES",
          },
          "Expediente actualizado",
          "UPDATED",
        );
        await load();
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar el expediente.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function advance() {
    if (!measurement) return;
    if (measurement.status === "COMPLETED") {
      await handleGenerateQuotation();
      return;
    }
    const next: Record<MeasurementStatus, MeasurementStatus | undefined> = {
      PLANNED: "ASSIGNED",
      ASSIGNED: "IN_PROGRESS",
      IN_PROGRESS: "COMPLETED",
      COMPLETED: "QUOTED",
      QUOTED: "CLOSED",
      CLOSED: undefined,
      CANCELLED: undefined,
    };
    const n = next[measurement.status];
    if (!n) return;
    if (n === "ASSIGNED" && measurement.assigned_mode === "UNASSIGNED") {
      setError("Asigna un medidor antes de continuar.");
      setEditing(true);
      return;
    }
    try {
      await updateMeasurement(
        measurement.id,
        { status: n },
        `Estado cambiado a ${statusMeta[n].label}`,
        "STATUS_CHANGED",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cambiar el estado.",
      );
    }
  }

  async function handleGenerateQuotation() {
    if (!measurement) return;
    setSaving(true);
    setError("");
    try {
      const quotationId = await generateQuotationFromMeasurement(measurement.id);
      navigate(`/ventas/presupuestos/${quotationId}/editar`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo generar el presupuesto.",
      );
      setSaving(false);
    }
  }

  async function cancel() {
    if (!measurement) return;
    try {
      await markMeasurementCancelled(measurement.id);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cancelar la medición.",
      );
    }
  }
  if (loading) return <div className="loading-block">Cargando expediente…</div>;
  if (!measurement)
    return (
      <div className="module-page">
        <MessageLog error={error || "Expediente no encontrado."} />
      </div>
    );
  const current = draft as Measurement;
  const hasCustomer = !!current.customer_id;
  const canEditPhotos =
    measurement.status === "IN_PROGRESS" &&
    measurement.assigned_mode === "USER" &&
    measurement.assigned_user_id === user?.id;
  const showPhotos = !["PLANNED", "ASSIGNED"].includes(measurement.status);
  const actionPanel = (
    <section className="panel measurement-next measurement-actions-panel">
      <div className="panel-head">
        <div>
          <h2>Acciones</h2>
        </div>
        <Ruler size={19} />
      </div>
      {["CANCELLED", "CLOSED"].includes(measurement.status) ? (
        <div className="side-action muted">Sin acciones pendientes.</div>
      ) : measurement.status === "QUOTED" || linkedQuotation ? (
        <div
          className="side-action muted"
          style={{ display: "flex", flexDirection: "column", gap: "8px" }}
        >
          <span>
            Presupuesto generado. Expediente bloqueado para cancelación.
          </span>
          {linkedQuotation && (
            <button
              type="button"
              className="secondary-button full"
              onClick={() =>
                navigate(`/ventas/presupuestos/${linkedQuotation.id}`)
              }
            >
              <FileText size={16} /> Ver presupuesto {linkedQuotation.code}
            </button>
          )}
        </div>
      ) : measurement.status === "COMPLETED" ? (
        <button
          type="button"
          className="next-action"
          disabled={saving}
          onClick={handleGenerateQuotation}
        >
          <FileText size={18} />{" "}
          {saving ? "Generando presupuesto…" : "Generar presupuesto"}
        </button>
      ) : (
        <button type="button" className="next-action" onClick={advance}>
          {measurement.status === "IN_PROGRESS" ? (
            <CheckCircle2 size={18} />
          ) : (
            <Clock3 size={18} />
          )}{" "}
          {statusMeta[measurement.status].next}
        </button>
      )}
      {!["CANCELLED", "CLOSED", "QUOTED"].includes(measurement.status) &&
        !linkedQuotation && (
          <button type="button" className="danger-button full" onClick={cancel}>
            <XCircle size={16} /> Cancelar medición
          </button>
        )}
    </section>
  );
  return (
    <div className="module-page measurement-detail-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">
            GESTIÓN / MEDICIONES / {measurement.code}
          </div>
          <h1>{measurement.code}</h1>
          <p>
            {current.customer_name_snapshot || "Datos de contacto"}
            {current.site_city ? ` · ${current.site_city}` : ""}
          </p>
        </div>
        <div className="measurement-head-actions">
          <button
            className="secondary-button"
            onClick={() => navigate("/gestion/mediciones")}
          >
            <ArrowLeft size={15} /> Volver
          </button>
          {!editing &&
            !["CANCELLED", "CLOSED"].includes(measurement.status) && (
              <button
                className="secondary-button"
                onClick={() => setEditing(true)}
              >
                Editar expediente
              </button>
            )}
        </div>
      </div>
      <MessageLog error={error} />
      <div className="measurement-summary">
        <div>
          <span>Número</span>
          <strong>{measurement.code}</strong>
        </div>
        <div>
          <span>Estado</span>
          <StatusBadge status={measurement.status} />
        </div>
        <div>
          <span>Próxima acción</span>
          <strong>{statusMeta[measurement.status].next}</strong>
        </div>
        <div>
          <span>Fecha medición</span>
          <strong>{formatDate(measurement.measurement_date)}</strong>
        </div>
      </div>
      <div className="measurement-grid">
        <form onSubmit={save} className="measurement-main">
          {actionPanel}
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Datos de Contacto</h2>
                <p>
                  {hasCustomer
                    ? "Datos obtenidos del cliente seleccionado."
                    : "Cliente potencial: introduce los datos de contacto directamente en el expediente."}
                </p>
              </div>
              <User size={19} />
            </div>
            {editing && (
              <div className="measurement-customer-picker">
                <EntitySearchField<CustomerOption & { label: string; secondary?: string }>
                  label="Cliente (opcional)"
                  value={
                    current.customer_id
                      ? {
                          id: current.customer_id,
                          label: customerSearch,
                          party: {
                            legal_name: customerSearch,
                            trade_name: customerSearch,
                            tax_id: current.customer_tax_id_snapshot ?? null,
                            code: null,
                            phone: current.customer_phone_snapshot ?? null,
                            email: current.customer_email_snapshot ?? null,
                          },
                        }
                      : null
                  }
                  onChange={(opt) => (opt ? chooseCustomer(opt) : clearCustomer())}
                  onSearch={async (q) => {
                    if (!q.trim()) return [];
                    const rows = (await getCustomerSummaries(q)) as CustomerOption[];
                    return rows.map((c) => ({
                      ...c,
                      label: c.party.trade_name || c.party.legal_name,
                      secondary: c.party.code || c.party.phone || undefined,
                    }));
                  }}
                  placeholder="Buscar por nombre, código o teléfono…"
                />
                {hasCustomer && (
                  <button
                    type="button"
                    className="secondary-button compact"
                    onClick={clearCustomer}
                  >
                    Convertir en cliente potencial
                  </button>
                )}
              </div>
            )}
            <div className="form-grid contact-data-grid">
              <label>
                Nombre *
                <input
                  disabled={hasCustomer || !editing}
                  value={current.customer_name_snapshot || ""}
                  onChange={(e) =>
                    update("customer_name_snapshot", e.target.value)
                  }
                />
              </label>
              <label>
                Teléfono
                <input
                  disabled={hasCustomer || !editing}
                  value={current.customer_phone_snapshot || ""}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="600 000 000"
                  onChange={(e) =>
                    update("customer_phone_snapshot", e.target.value)
                  }
                />
              </label>
              <label>
                Móvil
                <input
                  disabled={hasCustomer || !editing}
                  value={current.customer_mobile_snapshot || ""}
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="600 000 000"
                  onChange={(e) =>
                    update("customer_mobile_snapshot", e.target.value)
                  }
                />
              </label>
              <label className="wide">
                Email
                <input
                  type="email"
                  disabled={hasCustomer || !editing}
                  value={current.customer_email_snapshot || ""}
                  onChange={(e) =>
                    update("customer_email_snapshot", e.target.value)
                  }
                />
              </label>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Ubicación de la medición</h2>
                <p>
                  La dirección se puede localizar mediante la API de
                  direcciones, igual que en Clientes.
                </p>
              </div>
            </div>
            {editing ? (
              <div className="form-grid measurement-address-grid">
                <AddressLookup value={address} onChange={updateAddress} />
                <label className="measurement-address-wide">
                  Dirección
                  <input
                    value={address.street}
                    onChange={(e) =>
                      updateAddress({ ...address, street: e.target.value })
                    }
                  />
                </label>
                <label>
                  Código Postal
                  <input
                    value={address.postal_code}
                    onChange={(e) =>
                      updateAddress({ ...address, postal_code: e.target.value })
                    }
                  />
                </label>
                <label>
                  Localidad
                  <input
                    value={address.city}
                    onChange={(e) =>
                      updateAddress({ ...address, city: e.target.value })
                    }
                  />
                </label>
                <label>
                  Provincia
                  <input
                    value={address.region}
                    onChange={(e) =>
                      updateAddress({ ...address, region: e.target.value })
                    }
                  />
                </label>
              </div>
            ) : (
              <div className="form-grid measurement-address-grid">
                <label className="measurement-address-wide">
                  Dirección
                  <input readOnly value={current.site_street || ""} />
                </label>
                <label>
                  Código Postal
                  <input readOnly value={current.site_postal_code || ""} />
                </label>
                <label>
                  Localidad
                  <input readOnly value={current.site_city || ""} />
                </label>
                <label>
                  Provincia
                  <input readOnly value={current.site_region || ""} />
                </label>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Agenda y asignación</h2>
                <p>
                  La persona que realiza la medición se gestiona por usuario del
                  sistema.
                </p>
              </div>
              <CalendarDays size={19} />
            </div>
            <div className="form-grid">
              <label>
                Forma de contacto
                <select
                  disabled={!editing}
                  value={current.contact_method || ""}
                  onChange={(e) =>
                    update("contact_method", e.target.value || null)
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
              <label>
                Comercial
                <input
                  disabled={!editing}
                  value={current.commercial_name || ""}
                  onChange={(e) =>
                    update("commercial_name", e.target.value || null)
                  }
                  placeholder="Opcional"
                />
              </label>
              <label>
                Fecha de contacto
                <input
                  type="date"
                  disabled={!editing}
                  value={current.contact_date || ""}
                  onChange={(e) => update("contact_date", e.target.value)}
                />
              </label>
              <label>
                Fecha de medición
                <input
                  type="date"
                  disabled={!editing}
                  value={current.measurement_date || ""}
                  onChange={(e) =>
                    update("measurement_date", e.target.value || null)
                  }
                />
              </label>
              <label>
                Hora
                <input
                  type="time"
                  disabled={!editing}
                  value={current.measurement_time || ""}
                  onChange={(e) =>
                    update("measurement_time", e.target.value || null)
                  }
                />
              </label>
              <label>
                Medidor
                <select
                  disabled={!editing}
                  value={
                    current.assigned_mode === "USER"
                      ? current.assigned_user_id || ""
                      : ""
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    update("assigned_mode", value ? "USER" : "UNASSIGNED");
                    update("assigned_user_id", value || null);
                  }}
                >
                  <option value="">Sin asignar</option>
                  {current.assigned_mode === "USER" &&
                    current.assigned_user_id &&
                    !measurers.some(
                      (m) => m.auth_user_id === current.assigned_user_id,
                    ) && (
                      <option value={current.assigned_user_id}>
                        {assignedUserName || "Usuario asignado"}
                      </option>
                    )}
                  {measurers.map((m) => (
                    <option key={m.auth_user_id} value={m.auth_user_id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Observaciones</h2>
                <p>Información libre del expediente.</p>
              </div>
              <FileText size={19} />
            </div>
            <label className="wide measurement-observations">
              <textarea
                disabled={!editing}
                rows={7}
                value={current.observations || ""}
                onChange={(e) => update("observations", e.target.value)}
                placeholder="Acceso, detalles de la visita, incidencias…"
              />
            </label>
          </section>
          {showPhotos && (
            <>
              <MeasurementOpeningsSection
                measurementId={measurement.id}
                canEdit={canEditPhotos}
              />
              <MeasurementPhotos
                measurementId={measurement.id}
                canEdit={canEditPhotos}
              />
            </>
          )}
          {editing && (
            <div className="measurement-save-bar">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setDraft(measurement);
                  setAddress({
                    address_type: "INSTALACION",
                    street: measurement.site_street ?? "",
                    postal_code: measurement.site_postal_code ?? "",
                    city: measurement.site_city ?? "",
                    region: measurement.site_region ?? "",
                    country_code: measurement.site_country_code || "ES",
                  });
                  setCustomerSearch(measurement.customer_name_snapshot || "");
                  setError("");
                  setEditing(false);
                }}
              >
                Cancelar edición
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={saving}
              >
                {saving ? "Guardando…" : "Guardar expediente"}
              </button>
            </div>
          )}
        </form>
        <aside className="measurement-side">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Actividad</h2>
                <p>Historial del expediente.</p>
              </div>
            </div>
            <div className="activity-list">
              {activities.length === 0 ? (
                <span className="secondary">Sin actividad.</span>
              ) : (
                activities.map((a) => (
                  <div key={a.id} className="activity-item">
                    <span className="activity-dot" />
                    <div>
                      <strong>{a.message}</strong>
                      <div className="secondary">
                        {new Intl.DateTimeFormat("es-ES", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(a.created_at))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Presupuesto</h2>
                <p>Documento comercial originado de esta medición.</p>
              </div>
              <FileText size={18} />
            </div>
            {linkedQuotation ? (
              <div className="measurement-linked-quotation-card">
                <div className="linked-quotation-header">
                  <div>
                    <span className="linked-quotation-eyebrow">PRESUPUESTO ASOCIADO</span>
                    <strong className="linked-quotation-code">{linkedQuotation.code}</strong>
                  </div>
                  <span className={`measurement-status ${linkedQuotation.status.toLowerCase()}`}>
                    {linkedQuotation.status === "DRAFT"
                      ? "Borrador"
                      : linkedQuotation.status === "SENT"
                        ? "Enviado"
                        : linkedQuotation.status === "ACCEPTED"
                          ? "Aceptado"
                          : linkedQuotation.status === "REJECTED"
                            ? "Rechazado"
                            : linkedQuotation.status}
                  </span>
                </div>
                <div className="linked-quotation-meta">
                  <div>
                    <span>Fecha emisión</span>
                    <strong>{formatDate(linkedQuotation.issue_date)}</strong>
                  </div>
                  <div>
                    <span>Importe total</span>
                    <strong>
                      {Number(linkedQuotation.total_amount || 0).toLocaleString("es-ES", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </strong>
                  </div>
                </div>
                <div className="linked-quotation-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => navigate(`/ventas/presupuestos/${linkedQuotation.id}`)}
                  >
                    Ver presupuesto
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => navigate(`/ventas/presupuestos/${linkedQuotation.id}/editar`)}
                  >
                    Editar
                  </button>
                </div>
              </div>
            ) : measurement.status === "COMPLETED" ? (
              <div className="measurement-quotation-cta">
                <p>Medición completada. Ya puedes generar el presupuesto borrador para su valoración.</p>
                <button
                  type="button"
                  className="primary-button full"
                  disabled={saving}
                  onClick={handleGenerateQuotation}
                >
                  <FileText size={16} />{" "}
                  {saving ? "Generando…" : "Generar presupuesto"}
                </button>
              </div>
            ) : measurement.status === "QUOTED" ? (
              <div className="side-placeholder">
                Medición en estado presupuestada. Cargando datos del presupuesto…
              </div>
            ) : ["CANCELLED", "CLOSED"].includes(measurement.status) ? (
              <div className="side-placeholder">
                Sin presupuesto comercial asociado.
              </div>
            ) : (
              <div className="side-placeholder">
                Disponible una vez completada la medición.
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
