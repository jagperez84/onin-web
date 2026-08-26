import { useState } from "react";
import { XCircle, X, AlertTriangle } from "lucide-react";
import { cancelDraftQuotation } from "../../services/sales/quotationRepository";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quotation: {
    id: number;
    code: string;
    customer?: any;
    contact_name?: string | null;
    measurement_id?: number | null;
  };
  onCancelSuccess: () => void;
}

export function QuotationCancelModal({
  isOpen,
  onClose,
  quotation,
  onCancelSuccess,
}: Props) {
  const customerName =
    quotation.customer?.party?.trade_name ||
    quotation.customer?.party?.legal_name ||
    quotation.contact_name ||
    "Cliente potencial";

  const [reason, setReason] = useState("Descarte / Rechazo previo");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const fullReason = comments ? `${reason} - ${comments}` : reason;
      await cancelDraftQuotation(quotation.id, fullReason);
      onCancelSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al cancelar el presupuesto.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="status-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge danger">
              <XCircle size={20} />
            </div>
            <div>
              <h3>Cancelar presupuesto</h3>
              <p className="modal-subtitle">
                Presupuesto {quotation.code} · {customerName}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleConfirm}>
          <div className="modal-body">
            {error && <div className="modal-error">{error}</div>}

            <div
              style={{
                display: "flex",
                gap: "10px",
                padding: "12px 14px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                color: "#991b1b",
                fontSize: "13px",
                lineHeight: "1.45",
                marginBottom: "16px",
              }}
            >
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>¿Deseas cancelar y ocultar este presupuesto?</strong>
                <p style={{ margin: "4px 0 0", color: "#7f1d1d" }}>
                  Al cancelarlo, este presupuesto en borrador quedará anulado y se
                  ocultará de las vistas activas de ventas.
                </p>
              </div>
            </div>

            <div className="modal-form-group">
              <label htmlFor="cancel-reason">Motivo de cancelación</label>
              <select
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="Descarte / Rechazo previo">
                  Descarte comercial / Rechazo por el cliente
                </option>
                <option value="Error en toma de datos">
                  Error en toma de datos o medidas
                </option>
                <option value="Duplicado">Presupuesto duplicado</option>
                <option value="Cancelación de proyecto">
                  Cancelación del proyecto u obra
                </option>
                <option value="Otro motivo">Otro motivo</option>
              </select>
            </div>

            <div className="modal-form-group">
              <label htmlFor="cancel-comments">
                Observaciones adicionales (opcional)
              </label>
              <textarea
                id="cancel-comments"
                rows={3}
                placeholder="Añade detalles sobre el motivo de cancelación…"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={loading}
            >
              Volver
            </button>
            <button
              type="submit"
              className="primary-button"
              style={{
                backgroundColor: "#dc2626",
                borderColor: "#b91c1c",
                color: "#fff",
              }}
              disabled={loading}
            >
              {loading ? "Cancelando…" : "Confirmar cancelación"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
