import { useState } from "react";
import { Link } from "react-router-dom";
import { Building, MapPin, Printer, Truck, X } from "lucide-react";
import {
  getDeliveryNoteById,
  updateDeliveryNoteStatus,
  type DeliveryNote,
} from "../../services/sales/deliveryNoteService";
import { CoreRepositoryError } from "../../services/core/coreRepository";
import "../quotations/quotation.css";

const money = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const date = (v: string | null) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString("es-ES") : "—");

const STATUS_LABEL: Record<DeliveryNote["status"], string> = {
  PENDING: "Pendiente",
  PREPARED: "Preparado",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
};
const NEXT_STATUS: Partial<Record<DeliveryNote["status"], { next: DeliveryNote["status"]; label: string }>> = {
  PREPARED: { next: "SHIPPED", label: "Marcar como enviado" },
  SHIPPED: { next: "DELIVERED", label: "Marcar como entregado" },
};

export function SalesOrderDeliveryNoteModal({
  note,
  onClose,
  onStatusChange,
}: {
  note: DeliveryNote;
  onClose: () => void;
  onStatusChange?: (updated: DeliveryNote) => void;
}) {
  const [current, setCurrent] = useState(note);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");

  async function advanceStatus() {
    const step = NEXT_STATUS[current.status];
    if (!step) return;
    setUpdating(true);
    setError("");
    try {
      await updateDeliveryNoteStatus(current.id, step.next);
      const refreshed = await getDeliveryNoteById(current.id);
      if (refreshed) {
        setCurrent(refreshed);
        onStatusChange?.(refreshed);
      }
    } catch (e) {
      setError(e instanceof CoreRepositoryError || e instanceof Error ? e.message : "No se pudo actualizar el estado.");
    } finally {
      setUpdating(false);
    }
  }

  const step = NEXT_STATUS[current.status];

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-card lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge primary">
              <Truck size={19} />
            </div>
            <div>
              <h3>Albarán de Entrega {current.code}</h3>
              <p>
                {current.customer_name}
                {current.customer_legal_name && current.customer_legal_name !== current.customer_name
                  ? ` (${current.customer_legal_name})`
                  : ""}
              </p>
            </div>
          </div>
          <div className="header-action-group">
            <button type="button" className="secondary-button compact" onClick={() => window.print()}>
              <Printer size={14} /> Imprimir / PDF
            </button>
            <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="modal-body delivery-note-body">
          {error && <div className="inline-error">{error}</div>}
          <div className="printable-delivery-note">
            <div className="dn-doc-header">
              <div className="dn-brand-block">
                <div className="dn-company-name">ONIN SISTEMAS</div>
                <div className="dn-company-meta">ERP & Gestión de Fabricación y Ventas</div>
              </div>
              <div className="dn-meta-block">
                <div className="dn-doc-title">ALBARÁN DE ENTREGA</div>
                <div className="dn-doc-code">{current.code}</div>
                <div className="dn-doc-date">Fecha: {date(current.issue_date)}</div>
                <div className="dn-doc-ref">
                  Pedido origen: <strong>{current.sales_order_code}</strong>
                  {current.installation_id != null && <> · generado desde montaje completado</>}
                </div>
              </div>
            </div>

            <div className="dn-parties-grid">
              <div className="dn-party-card">
                <div className="party-header">
                  <Building size={13} /> CLIENTE
                </div>
                <div className="party-name">{current.customer_name}</div>
                {current.customer_legal_name && <div className="party-sub">{current.customer_legal_name}</div>}
                <div className="party-detail">Pedido: {current.sales_order_code}</div>
              </div>

              <div className="dn-party-card">
                <div className="party-header">
                  <MapPin size={13} /> DIRECCIÓN DE ENTREGA
                </div>
                <div className="party-name">{current.delivery_address}</div>
                <div className="party-detail">
                  {current.delivery_postal_code} {current.delivery_city} {current.delivery_region}
                </div>
                <div className="party-detail">
                  Transporte: {current.carrier || "—"} {current.tracking_number ? `(${current.tracking_number})` : ""}
                </div>
              </div>
            </div>

            <div className="table-panel dn-table-wrap">
              <table>
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
                  {current.lines.map((l) => (
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
                                  ?.map((d: any) => `${d.name}: ${d.value} ${d.unit_code || ""}`)
                                  .join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="numeric">
                        <strong>{l.quantity}</strong>
                      </td>
                      <td className="numeric">{money(l.unit_price)}</td>
                      <td className="numeric">{l.discount_percent > 0 ? `${l.discount_percent}%` : "—"}</td>
                      <td className="numeric">
                        <strong>{money(l.total_amount)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="dn-footer-grid">
              <div className="dn-notes-box">
                <strong>Observaciones de Entrega</strong>
                <p>{current.notes || "Entrega realizada en perfectas condiciones y conforme a las especificaciones solicitadas."}</p>
              </div>
              <div className="dn-signature-box">
                <div className="signature-line"></div>
                <span>Firma y DNI del receptor</span>
                <small>Conforme con el material recibido</small>
              </div>
            </div>

            <div className="modal-actions-footer no-print">
              <Link to={`/ventas/pedidos/${current.sales_order_id}`} className="secondary-button" onClick={onClose}>
                Ver pedido {current.sales_order_code}
              </Link>
              <span className={`status-pill ${current.status === "DELIVERED" ? "success" : ""}`}>
                {STATUS_LABEL[current.status]}
              </span>
              {step && (
                <button type="button" className="primary-button" disabled={updating} onClick={advanceStatus}>
                  {updating ? "Actualizando…" : step.label}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
