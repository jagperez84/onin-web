import { useEffect, useState } from "react";
import { AlertTriangle, HelpCircle, X } from "lucide-react";

export type ConfirmDialogOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmRequest = ConfirmDialogOptions & { resolve: (value: boolean) => void };

let notify: ((request: ConfirmRequest | null) => void) | null = null;

export function confirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!notify) {
      resolve(window.confirm(options.message || options.title));
      return;
    }
    notify({ ...options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    notify = setRequest;
    return () => {
      notify = null;
    };
  }, []);

  if (!request) return null;

  const settle = (result: boolean) => {
    request.resolve(result);
    setRequest(null);
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={() => settle(false)}
    >
      <div className="modal-card sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <div className={`modal-icon-badge ${request.danger ? "danger" : "warning"}`}>
              {request.danger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
            </div>
            <div>
              <h3>{request.title}</h3>
            </div>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={() => settle(false)}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        {request.message && (
          <div className="modal-body">
            <p style={{ margin: 0 }}>{request.message}</p>
          </div>
        )}
        <div className="modal-actions-footer">
          <button type="button" className="secondary-button" onClick={() => settle(false)}>
            {request.cancelLabel || "Cancelar"}
          </button>
          <button
            type="button"
            className={request.danger ? "danger-button" : "primary-button"}
            onClick={() => settle(true)}
          >
            {request.confirmLabel || "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
