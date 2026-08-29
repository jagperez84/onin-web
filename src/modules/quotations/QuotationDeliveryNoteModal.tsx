import { useState } from "react";
import {
  Truck,
  X,
  Printer,
  Check,
  Package,
  MapPin,
  Calendar,
  Building,
  FileText,
  ArrowRight,
  Download,
  CheckCircle2,
} from "lucide-react";
import {
  createDeliveryNoteFromQuotation,
  type DeliveryNote,
  getDeliveryNoteByQuotationId,
} from "../../services/sales/deliveryNoteService";
import { Link } from "react-router-dom";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quotation: any;
  onCreated?: (note: DeliveryNote) => void;
}

export function QuotationDeliveryNoteModal({
  isOpen,
  onClose,
  quotation,
  onCreated,
}: Props) {
  const existingNote = getDeliveryNoteByQuotationId(quotation.id);
  const [createdNote, setCreatedNote] = useState<DeliveryNote | null>(
    existingNote,
  );

  const [deliveryDate, setDeliveryDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [carrier, setCarrier] = useState("Transporte propio / Agencia");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [notes, setNotes] = useState(quotation.notes || "");
  const [loading, setLoading] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  if (!isOpen) return null;

  const activeDoc = createdNote || existingNote;

  function handleCreate() {
    setLoading(true);
    try {
      const note = createDeliveryNoteFromQuotation(quotation, {
        deliveryDate,
        carrier,
        trackingNumber,
        notes,
      });
      setCreatedNote(note);
      setShowSuccessToast(true);
      if (onCreated) onCreated(note);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const customerName =
    quotation.customer?.party?.trade_name ||
    quotation.customer?.party?.legal_name ||
    "Cliente";
  const customerLegal = quotation.customer?.party?.legal_name || "";

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="delivery-note-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge primary">
              <Truck size={19} />
            </div>
            <div>
              <h3>
                {activeDoc
                  ? `Albarán de Entrega ${activeDoc.code}`
                  : `Generar Albarán desde Presupuesto ${quotation.code}`}
              </h3>
              <p>
                {customerName}{" "}
                {customerLegal && customerLegal !== customerName
                  ? `(${customerLegal})`
                  : ""}
              </p>
            </div>
          </div>
          <div className="header-action-group">
            {activeDoc && (
              <button
                type="button"
                className="secondary-button compact"
                onClick={handlePrint}
              >
                <Printer size={14} /> Imprimir / PDF
              </button>
            )}
            <button
              type="button"
              className="close-btn"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-body delivery-note-body">
          {showSuccessToast && (
            <div className="albaran-success-banner">
              <CheckCircle2 size={18} />
              <span>
                ¡Albarán <strong>{activeDoc?.code}</strong> generado y guardado
                con éxito! Listo para almacén y transporte.
              </span>
            </div>
          )}

          {!activeDoc ? (
            /* Creation Form */
            <div className="albaran-form-section">
              <div className="albaran-intro-box">
                <Package size={22} className="intro-icon" />
                <div>
                  <strong>Creación de Documento Albarán</strong>
                  <p>
                    Se copiarán automáticamente todas las líneas, mediciones,
                    despieces OTD y condiciones del presupuesto{" "}
                    <strong>{quotation.code}</strong>.
                  </p>
                </div>
              </div>

              <div className="albaran-fields-grid">
                <div className="form-group">
                  <label htmlFor="alb-date">
                    <span>
                      <Calendar size={14} /> Fecha prevista de entrega
                    </span>
                  </label>
                  <input
                    id="alb-date"
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="alb-carrier">
                    <span>
                      <Truck size={14} /> Transportista / Modalidad
                    </span>
                  </label>
                  <input
                    id="alb-carrier"
                    type="text"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="Ej. Transporte propio, SEUR, DHL..."
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="alb-tracking">
                    <span>Nº Seguimiento / Expedición</span>
                  </label>
                  <input
                    id="alb-tracking"
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="alb-warehouse">
                    <span>
                      <Building size={14} /> Almacén de origen
                    </span>
                  </label>
                  <input
                    id="alb-warehouse"
                    type="text"
                    readOnly
                    value={quotation.warehouse?.name || "Almacén Principal"}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="alb-notes">
                  <span>Instrucciones de entrega / Observaciones</span>
                </label>
                <textarea
                  id="alb-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Instrucciones para transportista o cliente..."
                />
              </div>

              <div className="albaran-preview-summary">
                <div className="summary-col">
                  <span className="summary-label">Líneas a expedir</span>
                  <strong>{quotation.lines?.length || 0} artículos</strong>
                </div>
                <div className="summary-col">
                  <span className="summary-label">Dirección de entrega</span>
                  <strong>
                    {quotation.installation_address_street ||
                      quotation.billing_address_street ||
                      "Dirección principal del cliente"}
                  </strong>
                </div>
                <div className="summary-col right">
                  <span className="summary-label">Importe Albarán</span>
                  <strong className="summary-amount">
                    {Number(quotation.total_amount || 0).toLocaleString(
                      "es-ES",
                      { style: "currency", currency: "EUR" },
                    )}
                  </strong>
                </div>
              </div>

              <div className="modal-actions-footer">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="primary-button create-alb-btn"
                  onClick={handleCreate}
                  disabled={loading}
                >
                  <Check size={16} />
                  {loading
                    ? "Generando Albarán…"
                    : "Generar y Registrar Albarán"}
                </button>
              </div>
            </div>
          ) : (
            /* Document View */
            <div className="printable-delivery-note">
              <div className="dn-doc-header">
                <div className="dn-brand-block">
                  <div className="dn-company-name">ONIN SISTEMAS</div>
                  <div className="dn-company-meta">
                    ERP & Gestión de Fabricación y Ventas
                  </div>
                </div>
                <div className="dn-meta-block">
                  <div className="dn-doc-title">ALBARÁN DE ENTREGA</div>
                  <div className="dn-doc-code">{activeDoc.code}</div>
                  <div className="dn-doc-date">
                    Fecha:{" "}
                    {new Date(
                      `${activeDoc.issue_date}T00:00:00`,
                    ).toLocaleDateString("es-ES")}
                  </div>
                  <div className="dn-doc-ref">
                    Presupuesto origen:{" "}
                    <strong>{activeDoc.quotation_code}</strong>
                  </div>
                </div>
              </div>

              <div className="dn-parties-grid">
                <div className="dn-party-card">
                  <div className="party-header">
                    <Building size={13} /> CLIENTE
                  </div>
                  <div className="party-name">{activeDoc.customer_name}</div>
                  {activeDoc.customer_legal_name && (
                    <div className="party-sub">
                      {activeDoc.customer_legal_name}
                    </div>
                  )}
                  <div className="party-detail">
                    Comercial: {activeDoc.commercial_name || "Sin asignar"}
                  </div>
                </div>

                <div className="dn-party-card">
                  <div className="party-header">
                    <MapPin size={13} /> DIRECCIÓN DE ENTREGA
                  </div>
                  <div className="party-name">{activeDoc.delivery_address}</div>
                  <div className="party-detail">
                    {activeDoc.delivery_postal_code} {activeDoc.delivery_city}{" "}
                    {activeDoc.delivery_region}
                  </div>
                  <div className="party-detail">
                    Transporte: {activeDoc.carrier}{" "}
                    {activeDoc.tracking_number
                      ? `(${activeDoc.tracking_number})`
                      : ""}
                  </div>
                </div>
              </div>

              <div className="dn-table-wrap">
                <table className="dn-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>#</th>
                      <th style={{ width: "130px" }}>Código</th>
                      <th>Descripción / Especificación</th>
                      <th className="numeric" style={{ width: "80px" }}>
                        Cant.
                      </th>
                      <th className="numeric" style={{ width: "100px" }}>
                        Precio
                      </th>
                      <th className="numeric" style={{ width: "60px" }}>
                        Dto.
                      </th>
                      <th className="numeric" style={{ width: "110px" }}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeDoc.lines.map((l) => (
                      <tr key={l.id}>
                        <td>{l.line_no}</td>
                        <td>
                          <strong>{l.product_code}</strong>
                        </td>
                        <td>
                          <div>{l.description}</div>
                          {l.configuration_snapshot && (
                            <div className="dn-line-snap-desc">
                              {l.configuration_snapshot.otd_code
                                ? `OTD: ${l.configuration_snapshot.inputs_display?.map((i: any) => `${i.name}: ${i.display_value}`).join(" · ")}`
                                : l.configuration_snapshot.dimensions
                                    ?.map(
                                      (d: any) =>
                                        `${d.name}: ${d.value} ${d.unit_code || ""}`,
                                    )
                                    .join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="numeric">
                          <strong>{l.quantity}</strong>
                        </td>
                        <td className="numeric">
                          {l.unit_price.toLocaleString("es-ES", {
                            style: "currency",
                            currency: "EUR",
                          })}
                        </td>
                        <td className="numeric">
                          {l.discount_percent > 0
                            ? `${l.discount_percent}%`
                            : "—"}
                        </td>
                        <td className="numeric">
                          <strong>
                            {l.total_amount.toLocaleString("es-ES", {
                              style: "currency",
                              currency: "EUR",
                            })}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="dn-footer-grid">
                <div className="dn-notes-box">
                  <strong>Observaciones de Entrega</strong>
                  <p>
                    {activeDoc.notes ||
                      "Entrega realizada en perfectas condiciones y conforme a las especificaciones solicitadas."}
                  </p>
                </div>
                <div className="dn-signature-box">
                  <div className="signature-line"></div>
                  <span>Firma y DNI del receptor</span>
                  <small>Conforme con el material recibido</small>
                </div>
              </div>

              <div className="modal-actions-footer no-print">
                <Link
                  to="/facturacion/albaranes"
                  className="secondary-button"
                  onClick={onClose}
                >
                  <FileText size={15} /> Ver en listado de Albaranes
                </Link>
                <button
                  type="button"
                  className="primary-button"
                  onClick={onClose}
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
