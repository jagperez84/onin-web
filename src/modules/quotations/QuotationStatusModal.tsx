import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  X,
  AlertCircle,
  PackageCheck,
  FileText,
} from "lucide-react";
import { updateQuotationStatus } from "../../services/sales/quotationRepository";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  targetStatus: "ACCEPTED" | "REJECTED" | "DRAFT";
  quotation: {
    id: number;
    code: string;
    total_amount: number;
    customer?: any;
    contact_name?: string | null;
    notes?: string | null;
  };
  onSuccess: (newStatus: string) => void;
}

export function QuotationStatusModal({
  isOpen,
  onClose,
  targetStatus,
  quotation,
  onSuccess,
}: Props) {
  const customerName =
    quotation.customer?.party?.trade_name ||
    quotation.customer?.party?.legal_name ||
    quotation.contact_name ||
    "Cliente";
  const isAccept = targetStatus === "ACCEPTED";
  const isReject = targetStatus === "REJECTED";

  const [rejectionReason, setRejectionReason] = useState("Precio");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      let updatedNotes = quotation.notes || "";
      if (isReject) {
        const rejectionNote = `[RECHAZADO: ${rejectionReason}${comments ? ` - ${comments}` : ""} - ${new Date().toLocaleDateString("es-ES")}]`;
        updatedNotes = updatedNotes
          ? `${updatedNotes}\n${rejectionNote}`
          : rejectionNote;
      } else if (isAccept) {
        const acceptNote = `[ACEPTADO por el cliente - ${new Date().toLocaleDateString("es-ES")}]`;
        updatedNotes = updatedNotes
          ? `${updatedNotes}\n${acceptNote}`
          : acceptNote;
      }
      await updateQuotationStatus(quotation.id, targetStatus, updatedNotes);
      onSuccess(targetStatus);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al actualizar el estado.",
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
            <div
              className={`modal-icon-badge ${isAccept ? "success" : isReject ? "danger" : "neutral"}`}
            >
              {isAccept ? (
                <CheckCircle2 size={20} />
              ) : isReject ? (
                <XCircle size={20} />
              ) : (
                <FileText size={20} />
              )}
            </div>
            <div>
              <h3>
                {isAccept
                  ? "Aceptar Presupuesto"
                  : isReject
                    ? "Rechazar Presupuesto"
                    : "Cambiar a Borrador"}
              </h3>
              <p>
                Presupuesto <strong>{quotation.code}</strong> · {customerName}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body status-modal-body">
          {error && (
            <div className="inline-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {isAccept && (
            <div className="status-confirm-box accept">
              <PackageCheck size={28} />
              <div>
                <strong>¿Confirmar la aceptación del presupuesto?</strong>
                <p>
                  El presupuesto quedará bloqueado comercialmente en estado{" "}
                  <strong>Aceptado</strong> y podrás generar de inmediato el
                  correspondiente <strong>Albarán de entrega</strong>.
                </p>
                <div className="status-amount-badge">
                  Importe a facturar:{" "}
                  <strong>
                    {quotation.total_amount.toLocaleString("es-ES", {
                      style: "currency",
                      currency: "EUR",
                    })}
                  </strong>
                </div>
              </div>
            </div>
          )}

          {isReject && (
            <>
              <div className="status-confirm-box reject">
                <AlertCircle size={24} />
                <div>
                  <strong>Registro de rechazo de presupuesto</strong>
                  <p>
                    Indica el motivo principal del rechazo para estadísticas
                    comerciales y seguimiento.
                  </p>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="reject-reason">
                  <span>Motivo del rechazo</span>
                </label>
                <select
                  id="reject-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                >
                  <option value="Precio / Competencia">
                    Precio / Competencia
                  </option>
                  <option value="Plazo de entrega">
                    Plazo de entrega incompatible
                  </option>
                  <option value="Cancelación de proyecto">
                    Proyecto cancelado por el cliente
                  </option>
                  <option value="Especificación técnica">
                    Especificación técnica no ajustada
                  </option>
                  <option value="Falta de presupuesto del cliente">
                    Falta de presupuesto del cliente
                  </option>
                  <option value="Otro motivo">Otro motivo</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="reject-comments">
                  <span>Comentarios o detalles adicionales (opcional)</span>
                </label>
                <textarea
                  id="reject-comments"
                  rows={3}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Detalles sobre las razones del cliente..."
                />
              </div>
            </>
          )}

          {!isAccept && !isReject && (
            <div className="status-confirm-box neutral">
              <FileText size={24} />
              <div>
                <strong>¿Reabrir como Borrador?</strong>
                <p>
                  El presupuesto volverá al estado <strong>Borrador</strong>{" "}
                  para permitir realizar modificaciones adicionales.
                </p>
              </div>
            </div>
          )}

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
              type="submit"
              className={`primary-button ${isAccept ? "success-action-btn" : isReject ? "danger-action-btn" : ""}`}
              disabled={loading}
            >
              {loading
                ? "Guardando…"
                : isAccept
                  ? "Confirmar y marcar como Aceptado"
                  : isReject
                    ? "Confirmar Rechazo"
                    : "Cambiar a Borrador"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
