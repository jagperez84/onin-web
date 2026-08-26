import { useState } from "react";
import {
  RefreshCw,
  X,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { renewQuotationValidity } from "../../services/sales/quotationRepository";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quotation: {
    id: number;
    code: string;
    valid_until: string | null;
    status: string;
  };
  onRenewSuccess: () => void;
}

export function QuotationRenewModal({
  isOpen,
  onClose,
  quotation,
  onRenewSuccess,
}: Props) {
  const today = new Date();

  function addDays(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  const [newValidDate, setNewValidDate] = useState<string>(addDays(30));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault();
    if (!newValidDate) {
      setError("Debes seleccionar una fecha de validez.");
      return;
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    if (newValidDate < todayStr) {
      setError("La nueva fecha de validez debe ser futura.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await renewQuotationValidity(quotation.id, newValidDate);
      onRenewSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al renovar la validez.",
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
      <div className="renew-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge warning">
              <RefreshCw size={18} />
            </div>
            <div>
              <h3>Renovar Fecha de Validez</h3>
              <p>
                Presupuesto <strong>{quotation.code}</strong>
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

        <form onSubmit={handleRenew} className="modal-body renew-modal-body">
          {error && (
            <div className="inline-error">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="renew-info-banner">
            <Clock size={18} className="renew-info-icon" />
            <div>
              <strong>Reactivación de presupuesto caducado</strong>
              <p>
                Al renovar la validez, el presupuesto volverá a estado{" "}
                <strong>Enviado</strong> y se habilitará nuevamente su edición
                para realizar ajustes comerciales si es necesario.
              </p>
            </div>
          </div>

          <div className="form-group">
            <label>
              <span>Accesos rápidos de ampliación</span>
            </label>
            <div className="preset-date-buttons">
              <button
                type="button"
                className={`preset-date-btn ${newValidDate === addDays(15) ? "active" : ""}`}
                onClick={() => setNewValidDate(addDays(15))}
              >
                +15 días (
                {new Date(Date.now() + 15 * 86400000).toLocaleDateString(
                  "es-ES",
                )}
                )
              </button>
              <button
                type="button"
                className={`preset-date-btn ${newValidDate === addDays(30) ? "active" : ""}`}
                onClick={() => setNewValidDate(addDays(30))}
              >
                +30 días (
                {new Date(Date.now() + 30 * 86400000).toLocaleDateString(
                  "es-ES",
                )}
                )
              </button>
              <button
                type="button"
                className={`preset-date-btn ${newValidDate === addDays(60) ? "active" : ""}`}
                onClick={() => setNewValidDate(addDays(60))}
              >
                +60 días (
                {new Date(Date.now() + 60 * 86400000).toLocaleDateString(
                  "es-ES",
                )}
                )
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="renew-valid-until">
              <span>
                Nueva fecha de validez <strong className="required">*</strong>
              </span>
            </label>
            <div className="input-with-icon-clean">
              <Calendar size={16} />
              <input
                id="renew-valid-until"
                type="date"
                required
                value={newValidDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setNewValidDate(e.target.value)}
              />
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
              type="submit"
              className="primary-button renew-action-btn"
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? "spin" : ""} />
              {loading
                ? "Renovando..."
                : "Confirmar renovación y pasar a Enviado"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
