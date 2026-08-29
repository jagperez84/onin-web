import { useState, useEffect } from "react";
import {
  FileText,
  Download,
  ExternalLink,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  generateQuotationPdfBlob,
  generateAndDownloadQuotationPdf,
} from "../../services/sales/quotationPdfService";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quotationId: number;
  quotationCode?: string;
}

export function QuotationPdfPreviewModal({
  isOpen,
  onClose,
  quotationId,
  quotationCode,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let currentUrl: string | null = null;
    if (isOpen && quotationId) {
      setLoading(true);
      setError(null);
      generateQuotationPdfBlob(quotationId)
        .then((result) => {
          currentUrl = result.url;
          setPdfUrl(result.url);
          setFilename(result.filename);
        })
        .catch((err) => {
          setError(
            err instanceof Error
              ? err.message
              : "Error al generar el documento PDF.",
          );
        })
        .finally(() => {
          setLoading(false);
        });
    }

    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [isOpen, quotationId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (quotationId) {
      void generateAndDownloadQuotationPdf(quotationId);
    }
  };

  const handleOpenNewTab = () => {
    if (pdfUrl) {
      window.open(pdfUrl, "_blank");
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="email-modal-card"
        style={{
          maxWidth: "900px",
          width: "95%",
          height: "88vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: "12px",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="modal-header"
          style={{
            padding: "14px 20px",
            background: "#f8fafc",
            borderBottom: "1px solid #e4e2dc",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                background: "#fee2e2",
                color: "#c4897a",
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: "12px",
              }}
            >
              PDF
            </div>
            <div>
              <h3
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                Documento Presupuesto {quotationCode || ""}
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "#64748b",
                  margin: "2px 0 0",
                }}
              >
                Vista previa del formato oficial de impresión y envío
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="secondary-button"
              onClick={handleOpenNewTab}
              disabled={!pdfUrl || loading}
              title="Abrir en pestaña nueva"
              style={{ padding: "6px 12px", fontSize: "12.5px" }}
            >
              <ExternalLink size={14} /> Nueva pestaña
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleDownload}
              disabled={loading}
              title="Descargar archivo PDF"
              style={{ padding: "6px 14px", fontSize: "12.5px" }}
            >
              <Download size={14} /> Descargar PDF
            </button>
            <button
              type="button"
              className="close-btn"
              onClick={onClose}
              aria-label="Cerrar"
              style={{ padding: "6px", borderRadius: "6px" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div
          style={{
            flex: 1,
            background: "#334155",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {loading && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
                color: "#fff",
              }}
            >
              <Loader2 size={32} className="spinner-icon" />
              <span style={{ fontSize: "14px", fontWeight: 500 }}>
                Generando documento PDF...
              </span>
            </div>
          )}

          {error && (
            <div
              style={{
                background: "#fff",
                padding: "24px",
                borderRadius: "8px",
                maxWidth: "400px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <AlertCircle size={32} style={{ color: "#c4897a" }} />
              <h4 style={{ margin: 0, color: "#0f172a" }}>
                Error al generar el PDF
              </h4>
              <p style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
                {error}
              </p>
            </div>
          )}

          {!loading && !error && pdfUrl && (
            <iframe
              src={pdfUrl}
              title={`Presupuesto ${quotationCode || ""}`}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
