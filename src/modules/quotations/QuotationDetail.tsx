import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CreditCard,
  FileText,
  UserRound,
  Warehouse,
  Clock3,
  Edit3,
  Eye,
  Mail,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Truck,
  Send,
  AlertTriangle,
  RotateCcw,
  PackageCheck,
  Download,
  Building2,
  Phone,
  MapPin,
  UserCheck,
  Ruler,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { CoreRepositoryError } from "../../services/core/coreRepository";
import { type QuotationLineSnapshot } from "../../services/sales/quotationLineCalculationService";
import {
  isQuotationExpired,
  getEffectiveStatus,
} from "../../services/sales/quotationRepository";
import {
  getDeliveryNoteByQuotationId,
  type DeliveryNote,
} from "../../services/sales/deliveryNoteService";
import { generateAndDownloadQuotationPdf } from "../../services/sales/quotationPdfService";
import { getQuotationConversionStatus } from "../../services/sales/salesOrderService";
import { QuotationLineSnapshotModal } from "./QuotationLineSnapshotModal";
import { QuotationEmailModal } from "./QuotationEmailModal";
import { QuotationRenewModal } from "./QuotationRenewModal";
import { QuotationStatusModal } from "./QuotationStatusModal";
import { QuotationDeliveryNoteModal } from "./QuotationDeliveryNoteModal";
import { QuotationPdfPreviewModal } from "./QuotationPdfPreviewModal";
import { Toast } from "../../components/ui/Toast";
import "./quotation.css";
import "./quotation-configurator.css";

type Detail = {
  id: number;
  code: string;
  issue_date: string;
  valid_until: string | null;
  status: string;
  reference: string | null;
  notes: string | null;
  measurement_id?: number | null;
  customer_id?: number | null;
  measurement?: {
    id: number;
    code: string;
    status: string;
    customer_name_snapshot?: string | null;
  } | null;
  contact_id?: number | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  net_amount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  customer?: {
    id?: number;
    party?: {
      id?: number;
      legal_name?: string | null;
      trade_name?: string | null;
      tax_id?: string | null;
      email?: string | null;
      phone?: string | null;
    } | null;
  } | null;
  commercial: any;
  warehouse: any;
  payment_method: any;
  payment_term: any;
  billing_address_label?: string | null;
  billing_address_street?: string | null;
  billing_address_city?: string | null;
  billing_address_postal_code?: string | null;
  billing_address_region?: string | null;
  installation_address_label?: string | null;
  installation_address_street?: string | null;
  installation_address_city?: string | null;
  installation_address_postal_code?: string | null;
  installation_address_region?: string | null;
  lines: any[];
};

const money = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const date = (value: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString("es-ES") : "—";
const statusLabel = (s: string) =>
  ({
    DRAFT: "Borrador",
    SENT: "Enviado",
    ACCEPTED: "Aceptado",
    REJECTED: "Rechazado",
    EXPIRED: "Caducado",
  })[s] || s;

const partyName = (p: any, fallbackName?: string | null) =>
  p?.party?.trade_name ||
  p?.party?.legal_name ||
  fallbackName ||
  "Cliente potencial / Sin asignar";

function quotationTotals(lines: any[]) {
  return (lines ?? []).reduce(
    (totals, line) => {
      const quantity = Number(line.quantity || 0);
      const unitPrice = Number(line.unit_price || 0);
      const lineNet = Number(line.net_amount || 0);
      const lineTax = Number(line.tax_amount || 0);
      const gross = quantity * unitPrice;
      return {
        base: totals.base + lineNet,
        discount: totals.discount + (gross - lineNet),
        tax: totals.tax + lineTax,
        total: totals.total + Number(line.total_amount || 0),
      };
    },
    { base: 0, discount: 0, tax: 0, total: 0 },
  );
}

export function QuotationDetail() {
  const { id } = useParams();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  // Modals
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] =
    useState<QuotationLineSnapshot | null>(null);
  const [selectedLineNo, setSelectedLineNo] = useState(1);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState<
    "ACCEPTED" | "REJECTED" | "DRAFT"
  >("ACCEPTED");
  const [deliveryNoteModalOpen, setDeliveryNoteModalOpen] = useState(false);
  const [existingDeliveryNote, setExistingDeliveryNote] =
    useState<DeliveryNote | null>(null);
  const [orderConversionState, setOrderConversionState] = useState<
    "none" | "partial" | "full"
  >("none");

  async function loadQuotation() {
    try {
      if (!supabase)
        throw new CoreRepositoryError("Supabase no está configurado.");
      const {
        data: { user },
        error: ue,
      } = await supabase.auth.getUser();
      if (ue || !user)
        throw new CoreRepositoryError("No hay un usuario autenticado.");
      const { data: ua, error: uae } = await supabase
        .from("user_account")
        .select("company_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (uae) throw new CoreRepositoryError(uae.message);
      if (ua?.company_id == null)
        throw new CoreRepositoryError("El usuario no tiene empresa asignada.");
      const cid = Number(ua.company_id);

      let q: any = null;
      const { data: qWithContacts, error: qeWithContacts } = await supabase
        .from("quotation")
        .select(
          "id,code,issue_date,valid_until,status,reference,notes,measurement_id,customer_id,measurement:measurement_id(id,code,status,customer_name_snapshot),contact_id,contact_name,contact_email,contact_phone,contact:contact_id(id,first_name,last_name,email,phone,mobile,job_title,department),net_amount,discount_amount,tax_amount,total_amount,billing_address_street,billing_address_city,billing_address_postal_code,billing_address_region,installation_address_street,installation_address_city,installation_address_postal_code,installation_address_region,customer:customer_id(id,party:party_id(legal_name,trade_name,tax_id,email,phone)),commercial:commercial_id(party:party_id(legal_name,trade_name)),warehouse:warehouse_id(id,code,name),payment_method:payment_method_id(code,name),payment_term:payment_term_id(code,name),lines:quotation_line(id,line_no,description,quantity,unit_price,discount_percent,tax_percent,net_amount,tax_amount,total_amount,specific_data,product:product_id(id,code,commercial_description,technical_description,include_measurements_in_stock,family:family_id(recuttable)))",
        )
        .eq("company_id", cid)
        .eq("id", Number(id))
        .maybeSingle();

      if (qeWithContacts) {
        // Try with contact_id and contact relation (omitting contact_name/email/phone custom columns if they don't exist)
        const { data: qWithContactId, error: qeWithContactId } = await supabase
          .from("quotation")
          .select(
            "id,code,issue_date,valid_until,status,reference,notes,measurement_id,customer_id,measurement:measurement_id(id,code,status,customer_name_snapshot),contact_id,contact:contact_id(id,first_name,last_name,email,phone,mobile,job_title,department),net_amount,discount_amount,tax_amount,total_amount,billing_address_street,billing_address_city,billing_address_postal_code,billing_address_region,installation_address_street,installation_address_city,installation_address_postal_code,installation_address_region,customer:customer_id(id,party:party_id(legal_name,trade_name,tax_id,email,phone)),commercial:commercial_id(party:party_id(legal_name,trade_name)),warehouse:warehouse_id(id,code,name),payment_method:payment_method_id(code,name),payment_term:payment_term_id(code,name),lines:quotation_line(id,line_no,description,quantity,unit_price,discount_percent,tax_percent,net_amount,tax_amount,total_amount,specific_data,product:product_id(id,code,commercial_description,technical_description,include_measurements_in_stock,family:family_id(recuttable)))",
          )
          .eq("company_id", cid)
          .eq("id", Number(id))
          .maybeSingle();

        if (!qeWithContactId && qWithContactId) {
          q = qWithContactId;
        } else {
          // Fallback without contact
          const { data: qFallback, error: qeFallback } = await supabase
            .from("quotation")
            .select(
              "id,code,issue_date,valid_until,status,reference,notes,measurement_id,measurement:measurement_id(id,code,status,customer_name_snapshot),net_amount,discount_amount,tax_amount,total_amount,billing_address_street,billing_address_city,billing_address_postal_code,billing_address_region,installation_address_street,installation_address_city,installation_address_postal_code,installation_address_region,customer:customer_id(id,party:party_id(legal_name,trade_name,tax_id,email,phone)),commercial:commercial_id(party:party_id(legal_name,trade_name)),warehouse:warehouse_id(id,code,name),payment_method:payment_method_id(code,name),payment_term:payment_term_id(code,name),lines:quotation_line(id,line_no,description,quantity,unit_price,discount_percent,tax_percent,net_amount,tax_amount,total_amount,specific_data,product:product_id(id,code,commercial_description,technical_description,include_measurements_in_stock,family:family_id(recuttable)))",
            )
            .eq("company_id", cid)
            .eq("id", Number(id))
            .maybeSingle();

          if (qeFallback) throw new CoreRepositoryError(qeFallback.message);
          q = qFallback;
        }
      } else {
        q = qWithContacts;
      }
      if (!q) throw new CoreRepositoryError("Presupuesto no encontrado.");

      // Resolve contact details
      let cName = q.contact_name ?? "";
      let cEmail = q.contact_email ?? "";
      let cPhone = q.contact_phone ?? "";
      const cId = q.contact_id == null ? null : Number(q.contact_id);

      if (cId && (!cName || !cEmail || !cPhone)) {
        let relContact = q.contact;
        if (!relContact) {
          const { data: cData } = await supabase
            .from("contact")
            .select("id,first_name,last_name,email,phone,mobile")
            .eq("id", cId)
            .maybeSingle();
          relContact = cData;
        }
        if (relContact) {
          if (!cName)
            cName = [relContact.first_name, relContact.last_name]
              .filter(Boolean)
              .join(" ");
          if (!cEmail) cEmail = relContact.email || "";
          if (!cPhone) cPhone = relContact.phone || relContact.mobile || "";
        }
      }

      q.contact_name = cName || null;
      q.contact_email = cEmail || null;
      q.contact_phone = cPhone || null;

      setData(q as unknown as Detail);
      setExistingDeliveryNote(getDeliveryNoteByQuotationId(Number(id)));
      if (q.status === "ACCEPTED") {
        try {
          const conversion = await getQuotationConversionStatus(Number(id));
          const hasLines = conversion.length > 0;
          const isFull = hasLines && conversion.every((c) => c.remaining_quantity <= 0);
          const hasAnyConverted = conversion.some((c) => c.converted_quantity > 0);
          setOrderConversionState(isFull ? "full" : hasAnyConverted ? "partial" : "none");
        } catch {
          setOrderConversionState("none");
        }
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cargar el presupuesto.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQuotation();
  }, [id]);

  if (loading)
    return <div className="loading-block">Cargando presupuesto…</div>;
  if (error || !data) {
    return (
      <div className="module-page">
        <div className="page-head">
          <div>
            <div className="eyebrow">VENTAS / PRESUPUESTOS</div>
            <h1>Presupuesto</h1>
          </div>
        </div>
        <div className="inline-error">
          {error || "Presupuesto no encontrado."}
        </div>
      </div>
    );
  }

  const totals = quotationTotals(data.lines);
  const isExpired = isQuotationExpired({
    status: data.status,
    valid_until: data.valid_until,
  });
  const effectiveStatus = isExpired ? "EXPIRED" : data.status;

  const openSnapshot = (snapshot: any, lineNo: number) => {
    setSelectedSnapshot(snapshot);
    setSelectedLineNo(lineNo);
    setSnapshotModalOpen(true);
  };

  const openStatusChange = (status: "ACCEPTED" | "REJECTED" | "DRAFT") => {
    setTargetStatus(status);
    setStatusModalOpen(true);
  };

  const customerParty = data.customer?.party;
  const hasSpecificContact = Boolean(
    data.contact_name || data.contact_email || data.contact_phone,
  );

  const billingAddressText = [
    data.billing_address_street,
    data.billing_address_postal_code,
    data.billing_address_city,
    data.billing_address_region,
  ]
    .filter(Boolean)
    .join(", ");

  const installationAddressText = [
    data.installation_address_street,
    data.installation_address_postal_code,
    data.installation_address_city,
    data.installation_address_region,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="module-page quotation-page">
      {toast && <Toast message={toast} onClose={() => setToast("")} />}

      {/* Top Header with Breadcrumbs & Unified Action Bar */}
      <div className="quotation-detail-head">
        <div className="quotation-detail-title">
          <div className="quotation-detail-nav-row">
            <Link className="secondary-button" to="/ventas/presupuestos">
              <ArrowLeft size={15} /> Volver a presupuestos
            </Link>
            <span className="quotation-breadcrumb-code">
              Ventas / Presupuestos / <strong>{data.code}</strong>
            </span>
          </div>

          <div className="quotation-title-row">
            <h1>{data.code}</h1>
            <span
              className={`quotation-status ${effectiveStatus.toLowerCase()}`}
            >
              {statusLabel(effectiveStatus)}
            </span>
            {orderConversionState === "partial" && (
              <span
                className="status-pill warning"
                title="Algunas líneas de este presupuesto ya se han incluido en uno o más pedidos, pero queda cantidad pendiente"
              >
                Pedido parcial
              </span>
            )}
            {orderConversionState === "full" && (
              <span
                className="status-pill success"
                title="Todas las líneas de este presupuesto ya se han incluido en uno o más pedidos"
              >
                Convertido a pedido
              </span>
            )}
          </div>

          <div className="quotation-subtitle-meta">
            <span>
              Cliente: <strong>{partyName(data.customer, data.contact_name)}</strong>
            </span>
            {data.measurement_id && (
              <>
                <span className="dot-sep">·</span>
                <span>
                  Medición origen:{" "}
                  <Link
                    to={`/gestion/mediciones/${data.measurement_id}`}
                    style={{
                      color: "#2563eb",
                      fontWeight: 600,
                      textDecoration: "underline",
                    }}
                  >
                    {data.measurement?.code || `Medición #${data.measurement_id}`}
                  </Link>
                </span>
              </>
            )}
            <span className="dot-sep">·</span>
            <span>
              Emisión: <strong>{date(data.issue_date)}</strong>
            </span>
            <span className="dot-sep">·</span>
            <span>
              Validez:{" "}
              <strong className={isExpired ? "expired-text" : ""}>
                {data.valid_until ? date(data.valid_until) : "Sin fecha"}
              </strong>
            </span>
            {data.reference && (
              <>
                <span className="dot-sep">·</span>
                <span>
                  Ref: <strong>{data.reference}</strong>
                </span>
              </>
            )}
          </div>
        </div>

        {/* Unified Actions Toolbar */}
        <div className="quotation-actions-toolbar">
          {/* Status-Driven Primary Actions */}
          {effectiveStatus === "DRAFT" && (
            <button
              type="button"
              className="primary-button send-email-btn"
              onClick={() => setEmailModalOpen(true)}
              title="Enviar propuesta por email al cliente"
            >
              <Mail size={15} /> Enviar por email
            </button>
          )}

          {effectiveStatus === "SENT" && (
            <>
              <button
                type="button"
                className="primary-button success-btn"
                onClick={() => openStatusChange("ACCEPTED")}
                title="Marcar como aceptado por el cliente"
              >
                <CheckCircle2 size={15} /> Aceptar
              </button>
              <button
                type="button"
                className="secondary-button danger-btn"
                onClick={() => openStatusChange("REJECTED")}
                title="Marcar como rechazado"
              >
                <XCircle size={15} /> Rechazar
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEmailModalOpen(true)}
                title="Reenviar propuesta por correo electrónico"
              >
                <Mail size={15} /> Reenviar
              </button>
            </>
          )}

          {effectiveStatus === "ACCEPTED" && (
            <>
              {data.customer_id == null && (
                <Link
                  className="primary-button"
                  to={`/ventas/clientes/nuevo?quotationId=${data.id}`}
                  title="Crear la ficha de cliente a partir de este presupuesto"
                >
                  <UserRound size={15} /> Crear cliente
                </Link>
              )}
              {data.customer_id != null && orderConversionState === "full" && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled
                  title="Todas las líneas de este presupuesto ya se han incluido en un pedido"
                >
                  <PackageCheck size={15} /> Ya convertido a pedido
                </button>
              )}
              {data.customer_id != null && orderConversionState !== "full" && (
                <Link
                  className="primary-button"
                  to={`/ventas/pedidos/nuevo?quotationId=${data.id}`}
                  title="Crear el pedido a partir de este presupuesto aceptado"
                >
                  <PackageCheck size={15} /> Crear pedido
                </Link>
              )}
              <button
                type="button"
                className="primary-button albaran-btn"
                onClick={() => setDeliveryNoteModalOpen(true)}
                title={
                  existingDeliveryNote
                    ? "Consultar albarán generado"
                    : "Generar albarán de entrega"
                }
              >
                <Truck size={15} />
                {existingDeliveryNote
                  ? `Ver Albarán (${existingDeliveryNote.code})`
                  : "Crear Albarán"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => openStatusChange("DRAFT")}
                title="Revertir a borrador para rectificar o corregir"
              >
                <RotateCcw size={14} /> Reabrir
              </button>
            </>
          )}

          {effectiveStatus === "REJECTED" && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => openStatusChange("DRAFT")}
              title="Reabrir como borrador para renegociar"
            >
              <RotateCcw size={14} /> Reabrir como Borrador
            </button>
          )}

          {effectiveStatus === "EXPIRED" && (
            <button
              type="button"
              className="primary-button renew-btn"
              onClick={() => setRenewModalOpen(true)}
              title="Renovar fecha de validez"
            >
              <RefreshCw size={15} /> Renovar validez
            </button>
          )}

          {/* Edit action */}
          {(effectiveStatus === "DRAFT" || effectiveStatus === "SENT") && (
            <Link
              className="secondary-button"
              to={`/ventas/presupuestos/${data.id}/editar`}
              title="Modificar artículos, condiciones o datos"
            >
              <Edit3 size={15} /> Editar
            </Link>
          )}

          {/* Document PDF Actions */}
          <button
            type="button"
            className="secondary-button"
            onClick={() => setPdfModalOpen(true)}
            title="Previsualizar documento PDF comercial"
            style={{ background: "#fff" }}
          >
            <FileText size={15} /> Ver PDF
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void generateAndDownloadQuotationPdf(data.id)}
            title="Descargar presupuesto oficial en PDF"
            style={{ background: "#fff", padding: "8px 10px" }}
          >
            <Download size={15} />
          </button>
        </div>
      </div>

      {/* Contextual Status Bar */}
      <div className={`quotation-status-bar ${effectiveStatus.toLowerCase()}`}>
        <div className="quotation-status-bar-left">
          {effectiveStatus === "DRAFT" && <FileText size={16} />}
          {effectiveStatus === "SENT" && <Send size={16} />}
          {effectiveStatus === "ACCEPTED" && <PackageCheck size={16} />}
          {effectiveStatus === "REJECTED" && <XCircle size={16} />}
          {effectiveStatus === "EXPIRED" && <AlertTriangle size={16} />}

          <span>
            {effectiveStatus === "DRAFT" && (
              <>
                <strong>Presupuesto en Borrador:</strong> Revisa los artículos y
                condiciones antes de enviar la propuesta al cliente.
              </>
            )}
            {effectiveStatus === "SENT" && (
              <>
                <strong>Presupuesto Enviado:</strong> Esperando confirmación del
                cliente. Puedes registrar la aceptación o rechazo en la botonera
                superior.
              </>
            )}
            {effectiveStatus === "ACCEPTED" && (
              <>
                <strong>Presupuesto Aceptado:</strong> Propuesta aprobada por el
                cliente.
                {existingDeliveryNote
                  ? ` Vinculado al Albarán ${existingDeliveryNote.code}.`
                  : " Listo para expedición y entrega."}
              </>
            )}
            {effectiveStatus === "REJECTED" && (
              <>
                <strong>Presupuesto Rechazado:</strong> La propuesta no fue
                aprobada por el cliente.
              </>
            )}
            {effectiveStatus === "EXPIRED" && (
              <>
                <strong>Presupuesto Caducado:</strong> La fecha de validez
                expiró el {date(data.valid_until)}. Renueva la fecha para
                reactivarlo.
              </>
            )}
          </span>
        </div>
      </div>

      {/* 2-Column Overview: Customer & Contacts + Commercial Conditions */}
      <div className="quotation-overview-grid">
        {/* Card 1: Customer & Contacts */}
        <section className="quotation-detail-card">
          <div className="quotation-card-header">
            <h2 className="quotation-card-title">
              <Building2 size={17} /> Cliente y Persona de Contacto
            </h2>
            {customerParty?.tax_id ? (
              <span className="quotation-customer-tax">
                NIF: {customerParty.tax_id}
              </span>
            ) : (
              <span
                className="quotation-customer-tax"
                style={{
                  background: "#fef3c7",
                  color: "#92400e",
                  borderColor: "#fde68a",
                }}
              >
                Cliente potencial (sin ficha)
              </span>
            )}
          </div>

          {/* Customer Main Info Box */}
          <div className="quotation-customer-header-box">
            <div>
              <div className="quotation-customer-name">
                {partyName(data.customer, data.contact_name)}
              </div>
              {customerParty?.legal_name &&
                customerParty?.trade_name &&
                customerParty.legal_name !== customerParty.trade_name && (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#64748b",
                      marginTop: "2px",
                    }}
                  >
                    {customerParty.legal_name}
                  </div>
                )}
              {!customerParty && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#b45309",
                    marginTop: "4px",
                  }}
                >
                  Expediente de cliente no creado aún en el sistema.
                </div>
              )}
            </div>
            <div
              style={{ textAlign: "right", fontSize: "12px", color: "#64748b" }}
            >
              {(customerParty?.phone || data.contact_phone) && (
                <div>Tel: {customerParty?.phone || data.contact_phone}</div>
              )}
              {(customerParty?.email || data.contact_email) && (
                <div>{customerParty?.email || data.contact_email}</div>
              )}
            </div>
          </div>

          {/* Quotation Specific Contact Person */}
          <div className="quotation-contact-person-card">
            <div className="quotation-contact-person-top">
              <div
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span className="quotation-contact-tag">
                  Contacto del Presupuesto
                </span>
                {hasSpecificContact && (
                  <UserCheck size={15} style={{ color: "#2563eb" }} />
                )}
              </div>
            </div>

            <div className="quotation-contact-person-name">
              {data.contact_name ||
                "Sin persona de contacto específica asignada"}
            </div>

            {data.contact_email || data.contact_phone ? (
              <div className="quotation-contact-links">
                {data.contact_email && (
                  <a
                    href={`mailto:${data.contact_email}`}
                    className="quotation-contact-link-item"
                    title="Enviar correo"
                  >
                    <Mail size={13} /> {data.contact_email}
                  </a>
                )}
                {data.contact_phone && (
                  <a
                    href={`tel:${data.contact_phone}`}
                    className="quotation-contact-link-item"
                    title="Llamar por teléfono"
                  >
                    <Phone size={13} /> {data.contact_phone}
                  </a>
                )}
              </div>
            ) : (
              <div style={{ fontSize: "11.5px", color: "#64748b" }}>
                Se emplearán los canales de comunicación generales de la empresa
                cliente.
              </div>
            )}
          </div>

          {/* Addresses */}
          <div className="quotation-addresses-grid">
            <div className="quotation-address-box">
              <div className="quotation-address-label">
                <MapPin size={13} /> Dirección Facturación
              </div>
              <div className="quotation-address-text">
                {billingAddressText ||
                  "Dirección fiscal de la ficha de cliente"}
              </div>
            </div>

            <div className="quotation-address-box">
              <div className="quotation-address-label">
                <Truck size={13} /> Dirección Instalación / Envío
              </div>
              <div className="quotation-address-text">
                {installationAddressText ||
                  (billingAddressText
                    ? "Misma que facturación"
                    : "Sin especificar")}
              </div>
            </div>
          </div>
        </section>

        {/* Card 2: Commercial Conditions & Logistics */}
        <section className="quotation-detail-card">
          <div className="quotation-card-header">
            <h2 className="quotation-card-title">
              <CreditCard size={17} /> Condiciones Comerciales y Entrega
            </h2>
          </div>

          <div className="quotation-commercial-grid">
            <div className="quotation-info-item">
              <span>
                <UserRound size={14} /> Agente Comercial
              </span>
              <strong>{partyName(data.commercial)}</strong>
            </div>

            <div className="quotation-info-item">
              <span>
                <Warehouse size={14} /> Almacén de Salida
              </span>
              <strong>
                {data.warehouse?.code
                  ? `${data.warehouse.code} · ${data.warehouse.name}`
                  : data.warehouse?.name || "Sin asignar"}
              </strong>
            </div>

            <div className="quotation-info-item">
              <span>
                <CreditCard size={14} /> Forma de Pago
              </span>
              <strong>
                {data.payment_method?.code
                  ? `${data.payment_method.code} · ${data.payment_method.name}`
                  : data.payment_method?.name || "Sin especificar"}
              </strong>
            </div>

            <div className="quotation-info-item">
              <span>
                <FileText size={14} /> Términos / Vencimiento
              </span>
              <strong>
                {data.payment_term?.code
                  ? `${data.payment_term.code} · ${data.payment_term.name}`
                  : data.payment_term?.name || "Sin especificar"}
              </strong>
            </div>
          </div>

          {/* Observations & Notes if present */}
          {data.notes ? (
            <div className="quotation-notes-box">
              <div className="quotation-notes-box-title">
                <FileText size={14} /> Observaciones Comerciales
              </div>
              <div>{data.notes}</div>
            </div>
          ) : (
            <div
              style={{
                fontSize: "12px",
                color: "#94a3b8",
                fontStyle: "italic",
                marginTop: "auto",
              }}
            >
              Sin observaciones comerciales registradas.
            </div>
          )}
        </section>
      </div>

      {/* Generated Delivery Note Link if exists */}
      {existingDeliveryNote && (
        <section className="quotation-albaran-card">
          <div className="albaran-linked-box">
            <div className="albaran-linked-icon">
              <Truck size={24} />
            </div>
            <div className="albaran-linked-info">
              <div className="albaran-linked-header">
                <strong>Albarán de Entrega {existingDeliveryNote.code}</strong>
                <span className="status-pill">
                  {existingDeliveryNote.status}
                </span>
              </div>
              <p>
                Fecha de entrega:{" "}
                <strong>{date(existingDeliveryNote.delivery_date)}</strong> ·
                Dirección:{" "}
                <strong>{existingDeliveryNote.delivery_address}</strong>
              </p>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => setDeliveryNoteModalOpen(true)}
            >
              <Eye size={15} /> Ver Albarán
            </button>
          </div>
        </section>
      )}

      {/* Lines Section */}
      <section className="quotation-lines-section">
        <div className="quotation-section-head">
          <div>
            <h2>Líneas del Presupuesto</h2>
            <p>
              Artículos, configuración técnica (snapshot) y condiciones
              económicas acordadas.
            </p>
          </div>
          <span className="quotation-line-count">
            {data.lines?.length || 0}{" "}
            {(data.lines?.length || 0) === 1 ? "partida" : "partidas"}
          </span>
        </div>

        <div className="quotation-lines-layout">
          <div className="table-panel quotation-lines-table">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "38px" }}>#</th>
                  <th style={{ width: "130px" }}>Artículo</th>
                  <th>Descripción & Configuración</th>
                  <th className="numeric" style={{ width: "70px" }}>
                    Cant.
                  </th>
                  <th className="numeric" style={{ width: "95px" }}>
                    Precio
                  </th>
                  <th className="numeric" style={{ width: "55px" }}>
                    Dto.
                  </th>
                  <th className="numeric" style={{ width: "55px" }}>
                    IVA
                  </th>
                  <th className="numeric" style={{ width: "110px" }}>
                    Total
                  </th>
                  <th style={{ width: "110px" }}></th>
                </tr>
              </thead>
              <tbody>
                {(data.lines || [])
                  .sort((a, b) => a.line_no - b.line_no)
                  .map((l) => {
                    const snapshot = (l.specific_data?.configuration_snapshot ||
                      l.specific_data?.otd_snapshot) as any;
                    return (
                      <tr key={l.id}>
                        <td>{l.line_no}</td>
                        <td>
                          <strong className="quotation-product-code">
                            {l.product?.code ||
                              (snapshot?.otd_code
                                ? `OTD · ${snapshot.otd_code}`
                                : "Manual")}
                          </strong>
                        </td>
                        <td>
                          <div className="line-description-title">
                            {l.description ||
                              l.product?.commercial_description ||
                              "—"}
                          </div>
                          {snapshot && (
                            <div className="line-snapshot-preview-tag">
                              {snapshot.otd_code
                                ? `OTD: ${snapshot.inputs_display?.map((i: any) => `${i.name}: ${i.display_value}`).join(" · ")}`
                                : `${snapshot.dimensions?.map((d: any) => `${d.name}: ${d.value ?? 0} ${d.unit_code || ""}`).join(" · ")}${
                                    snapshot.selected_variant
                                      ? ` · ${snapshot.selected_variant.code}`
                                      : ""
                                  }`}
                            </div>
                          )}
                        </td>
                        <td className="numeric">
                          {Number(l.quantity).toLocaleString("es-ES")}
                        </td>
                        <td className="numeric">
                          {money(Number(l.unit_price || 0))}
                        </td>
                        <td className="numeric">
                          {Number(l.discount_percent || 0)}%
                        </td>
                        <td className="numeric">
                          {Number(l.tax_percent || 0)}%
                        </td>
                        <td className="numeric">
                          <strong>{money(Number(l.total_amount || 0))}</strong>
                        </td>
                        <td>
                          {snapshot && (
                            <button
                              type="button"
                              className="line-config-trigger"
                              onClick={() => openSnapshot(snapshot, l.line_no)}
                            >
                              <Eye size={13} />{" "}
                              {snapshot.otd_code ? "OTD" : "Despiece"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <aside className="quotation-totals-card">
            <div>
              <span>Base imponible</span>
              <strong>{money(totals.base)}</strong>
            </div>
            <div>
              <span>Descuentos</span>
              <strong>{money(totals.discount)}</strong>
            </div>
            <div>
              <span>Impuestos (IVA)</span>
              <strong>{money(totals.tax)}</strong>
            </div>
            <div className="quotation-total-final">
              <span>Total Presupuesto</span>
              <strong>{money(totals.total)}</strong>
            </div>
          </aside>
        </div>
      </section>

      {/* Modals */}
      {snapshotModalOpen && selectedSnapshot && (
        <QuotationLineSnapshotModal
          isOpen={snapshotModalOpen}
          onClose={() => setSnapshotModalOpen(false)}
          snapshot={selectedSnapshot}
          lineNo={selectedLineNo}
        />
      )}

      {emailModalOpen && (
        <QuotationEmailModal
          isOpen={emailModalOpen}
          onClose={() => setEmailModalOpen(false)}
          quotation={data}
          onSentSuccess={() => {
            setToast(
              "Presupuesto enviado por email. Estado actualizado a Enviado.",
            );
            void loadQuotation();
          }}
        />
      )}

      {renewModalOpen && (
        <QuotationRenewModal
          isOpen={renewModalOpen}
          onClose={() => setRenewModalOpen(false)}
          quotation={data}
          onRenewSuccess={() => {
            setToast(
              "Fecha de validez renovada con éxito. El presupuesto ha pasado a estado Enviado.",
            );
            void loadQuotation();
          }}
        />
      )}

      {statusModalOpen && (
        <QuotationStatusModal
          isOpen={statusModalOpen}
          onClose={() => setStatusModalOpen(false)}
          targetStatus={targetStatus}
          quotation={data}
          onSuccess={(newStatus) => {
            setToast(
              `Presupuesto actualizado a estado ${statusLabel(newStatus)}.`,
            );
            void loadQuotation();
          }}
        />
      )}

      {deliveryNoteModalOpen && (
        <QuotationDeliveryNoteModal
          isOpen={deliveryNoteModalOpen}
          onClose={() => setDeliveryNoteModalOpen(false)}
          quotation={data}
          onCreated={(note) => {
            setExistingDeliveryNote(note);
            setToast(`Albarán ${note.code} generado con éxito.`);
          }}
        />
      )}

      {pdfModalOpen && (
        <QuotationPdfPreviewModal
          isOpen={pdfModalOpen}
          onClose={() => setPdfModalOpen(false)}
          quotationId={data.id}
          quotationCode={data.code}
        />
      )}
    </div>
  );
}
