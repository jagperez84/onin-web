import { useState, useEffect } from "react";
import {
  Mail,
  X,
  Send,
  Paperclip,
  Building,
  AlertCircle,
  User,
  AtSign,
  Loader2,
  FileCheck,
  FileText,
  CheckCircle2,
  Eye,
  Edit3,
  Sparkles,
  RefreshCw,
  Phone,
  Download,
} from "lucide-react";
import { sendQuotationEmail } from "../../services/sales/quotationRepository";
import { QuotationPdfPreviewModal } from "./QuotationPdfPreviewModal";
import { generateAndDownloadQuotationPdf } from "../../services/sales/quotationPdfService";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  quotation: {
    id: number;
    code: string;
    issue_date: string;
    valid_until: string | null;
    total_amount: number;
    customer?: any;
    reference?: string | null;
    contact_id?: number | null;
    contact_name?: string | null;
    contact_email?: string | null;
    contact_phone?: string | null;
  };
  onSentSuccess: () => void;
}

type EmailTemplateKey = "standard" | "formal" | "quick" | "followup";

const TEMPLATES: Record<
  EmailTemplateKey,
  {
    name: string;
    icon: string;
    getSubject: (q: any, name: string) => string;
    getBody: (q: any, name: string) => string;
  }
> = {
  standard: {
    name: "Estándar",
    icon: "📄",
    getSubject: (q, name) => `Presupuesto ${q.code} - ${name}`,
    getBody: (q, name) =>
      `Estimado/a ${name},\n\nLe remitimos adjunto el presupuesto ${q.code}${q.reference ? ` (Ref: ${q.reference})` : ""} por importe total de ${q.total_amount.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}.\n\nEste presupuesto tiene validez hasta el ${q.valid_until ? new Date(`${q.valid_until}T00:00:00`).toLocaleDateString("es-ES") : "—"}.\n\nQuedamos a su entera disposición para cualquier aclaración o ajuste sobre la propuesta comercial.\n\nAtentamente,\nDepartamento Comercial`,
  },
  formal: {
    name: "Formal",
    icon: "💼",
    getSubject: (q, name) => `Propuesta comercial ${q.code} para ${name}`,
    getBody: (q, name) =>
      `A la atención de ${name},\n\nNos complace hacerle llegar nuestra mejor propuesta económica y técnica para el presupuesto ${q.code}${q.reference ? ` correspondiente a la referencia ${q.reference}` : ""}.\n\nEl importe total acordado asciende a ${q.total_amount.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}, con validez contractual hasta el ${q.valid_until ? new Date(`${q.valid_until}T00:00:00`).toLocaleDateString("es-ES") : "—"}.\n\nEn el documento PDF adjunto encontrará el desglose detallado de partidas, dimensiones y condiciones económicas.\n\nSin otro particular, le saludamos atentamente,\nDirección Comercial`,
  },
  quick: {
    name: "Ágil",
    icon: "⚡",
    getSubject: (q, name) => `Envío de presupuesto ${q.code}`,
    getBody: (q, name) =>
      `Hola ${name},\n\nTe adjuntamos el presupuesto ${q.code} por valor de ${q.total_amount.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}.\n\nRevisa el PDF adjunto con el detalle completo y avísanos si necesitas cualquier modificación para proceder con el pedido.\n\nUn cordial saludo,\nEquipo de Ventas`,
  },
  followup: {
    name: "Seguimiento",
    icon: "⏱️",
    getSubject: (q, name) => `Seguimiento de presupuesto ${q.code} - ${name}`,
    getBody: (q, name) =>
      `Estimado/a ${name},\n\nNos ponemos en contacto para hacer seguimiento del presupuesto ${q.code} enviado anteriormente por importe de ${q.total_amount.toLocaleString("es-ES", { style: "currency", currency: "EUR" })} (validez: ${q.valid_until ? new Date(`${q.valid_until}T00:00:00`).toLocaleDateString("es-ES") : "—"}).\n\n¿Ha tenido ocasión de revisarlo? Estamos a su disposición para resolver cualquier duda o realizar los ajustes necesarios.\n\nAtentamente,\nDepartamento Comercial`,
  },
};

export function QuotationEmailModal({
  isOpen,
  onClose,
  quotation,
  onSentSuccess,
}: Props) {
  const customerName =
    quotation.customer?.party?.trade_name ||
    quotation.customer?.party?.legal_name ||
    "Cliente";
  const customerHeaderEmail = quotation.customer?.party?.email || "";

  // Prioritize the quotation's stored contact details
  const storedContactName = quotation.contact_name?.trim() || "";
  const storedContactEmail = quotation.contact_email?.trim() || "";
  const storedContactPhone = quotation.contact_phone?.trim() || "";

  const effectiveRecipientName = storedContactName || customerName;
  const initialRecipientEmail = storedContactEmail || customerHeaderEmail || "";

  const [activeTemplate, setActiveTemplate] =
    useState<EmailTemplateKey>("standard");
  const [recipient, setRecipient] = useState(initialRecipientEmail);
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(
    TEMPLATES.standard.getSubject(quotation, effectiveRecipientName),
  );
  const [message, setMessage] = useState(
    TEMPLATES.standard.getBody(quotation, effectiveRecipientName),
  );
  const [attachPdf, setAttachPdf] = useState(true);
  const [showPdfPreviewModal, setShowPdfPreviewModal] = useState(false);
  const [viewMode, setViewMode] = useState<"edit" | "preview">("edit");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Synchronize initial state when opening or when quotation contact changes
  useEffect(() => {
    if (isOpen) {
      const email = storedContactEmail || customerHeaderEmail || "";
      setRecipient(email);
      const name = storedContactName || customerName;
      setSubject(TEMPLATES.standard.getSubject(quotation, name));
      setMessage(TEMPLATES.standard.getBody(quotation, name));
      setActiveTemplate("standard");
      setError("");
      setViewMode("edit");
    }
  }, [
    isOpen,
    quotation.id,
    storedContactEmail,
    storedContactName,
    customerHeaderEmail,
    customerName,
  ]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !sending) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, sending, onClose]);

  if (!isOpen) return null;

  const handleApplyTemplate = (key: EmailTemplateKey) => {
    setActiveTemplate(key);
    const name = effectiveRecipientName;
    setSubject(TEMPLATES[key].getSubject(quotation, name));
    setMessage(TEMPLATES[key].getBody(quotation, name));
  };

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!recipient.trim()) {
      setError(
        "Por favor, introduce una dirección de correo electrónico válida.",
      );
      return;
    }
    setSending(true);
    setError("");
    try {
      await sendQuotationEmail(quotation.id, {
        to: recipient.trim(),
        subject: subject.trim(),
        message: message.trim(),
        attachPdf,
      });
      onSentSuccess();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al enviar el correo electrónico.",
      );
    } finally {
      setSending(false);
    }
  }

  const hasDistinctCustomerEmail =
    customerHeaderEmail && customerHeaderEmail !== recipient;
  const hasDistinctContactEmail =
    storedContactEmail && storedContactEmail !== recipient;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="email-modal-card"
        style={{ maxWidth: "680px", width: "100%", borderRadius: "12px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className="modal-header"
          style={{
            padding: "16px 20px",
            background: "#f8fafc",
            borderBottom: "1px solid #e4e2dc",
          }}
        >
          <div className="modal-title-wrap">
            <div
              className="modal-icon-badge"
              style={{
                background: "#e0f2fe",
                color: "#0284c7",
                border: "1px solid #bae6fd",
                width: "38px",
                height: "38px",
                borderRadius: "8px",
                display: "grid",
                placeItems: "center",
              }}
            >
              <Mail size={18} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: "17px",
                  fontWeight: 600,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                Enviar presupuesto por correo
              </h3>
              <p
                style={{
                  fontSize: "12px",
                  color: "#64748b",
                  margin: "2px 0 0",
                }}
              >
                Se enviará la propuesta oficial y el estado cambiará a{" "}
                <strong>Enviado</strong>.
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* View Mode Toggle */}
            <div
              style={{
                display: "flex",
                background: "#e4e2dc",
                padding: "2px",
                borderRadius: "6px",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode("edit")}
                style={{
                  padding: "4px 9px",
                  borderRadius: "5px",
                  border: "none",
                  background: viewMode === "edit" ? "#fff" : "transparent",
                  color: viewMode === "edit" ? "#0f172a" : "#64748b",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  boxShadow:
                    viewMode === "edit" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                }}
              >
                <Edit3 size={13} /> Redactar
              </button>
              <button
                type="button"
                onClick={() => setViewMode("preview")}
                style={{
                  padding: "4px 9px",
                  borderRadius: "5px",
                  border: "none",
                  background: viewMode === "preview" ? "#fff" : "transparent",
                  color: viewMode === "preview" ? "#0f172a" : "#64748b",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  boxShadow:
                    viewMode === "preview"
                      ? "0 1px 2px rgba(0,0,0,0.05)"
                      : "none",
                }}
              >
                <Eye size={13} /> Vista previa
              </button>
            </div>
            <button
              type="button"
              className="close-btn"
              onClick={onClose}
              aria-label="Cerrar"
              disabled={sending}
              style={{ padding: "6px", borderRadius: "6px" }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Quotation Summary Ribbon */}
        <div
          style={{
            padding: "10px 20px",
            background: "#efeee9",
            borderBottom: "1px solid #e4e2dc",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
            fontSize: "12.5px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: "monospace",
                fontWeight: 700,
                background: "#e4e2dc",
                padding: "2px 7px",
                borderRadius: "4px",
                color: "#334155",
              }}
            >
              {quotation.code}
            </span>
            <span
              style={{
                color: "#475569",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Building size={13} style={{ color: "#64748b" }} />
              <strong>{customerName}</strong>
            </span>
            {storedContactName && (
              <span
                style={{
                  background: "#dbeafe",
                  color: "#1e40af",
                  padding: "2px 8px",
                  borderRadius: "12px",
                  fontSize: "11px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <User size={11} /> Contacto: {storedContactName}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#64748b", fontSize: "11.5px" }}>Total:</span>
            <strong style={{ color: "#0f172a", fontSize: "14px" }}>
              {quotation.total_amount.toLocaleString("es-ES", {
                style: "currency",
                currency: "EUR",
              })}
            </strong>
          </div>
        </div>

        <form
          onSubmit={handleSend}
          className="modal-body email-modal-body"
          style={{ padding: "18px 20px", gap: "14px" }}
        >
          {error && (
            <div
              className="inline-error"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 14px",
                background: "#f4eae6",
                border: "1px solid #fecaca",
                borderRadius: "6px",
                color: "#991b1b",
                fontSize: "13px",
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {viewMode === "edit" ? (
            <>
              {/* Template Selectors */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "6px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#64748b",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <Sparkles size={13} style={{ color: "#f59e0b" }} /> Plantilla
                  de mensaje:
                </span>
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                  {(Object.keys(TEMPLATES) as EmailTemplateKey[]).map((key) => {
                    const t = TEMPLATES[key];
                    const active = activeTemplate === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleApplyTemplate(key)}
                        style={{
                          fontSize: "11.5px",
                          padding: "3px 8px",
                          borderRadius: "5px",
                          border: active
                            ? "1px solid #3b82f6"
                            : "1px solid #cbd5e1",
                          background: active ? "#e7ede9" : "#fff",
                          color: active ? "#5c7a74" : "#475569",
                          fontWeight: active ? 600 : 500,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          transition: "all 0.1s ease",
                        }}
                      >
                        <span>{t.icon}</span> {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Recipient Field */}
              <div className="form-group" style={{ gap: "4px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <label
                    htmlFor="email-recipient"
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 600,
                      color: "#334155",
                      margin: 0,
                    }}
                  >
                    Destinatario <strong style={{ color: "#ef4444" }}>*</strong>
                  </label>
                  {!showCc && (
                    <button
                      type="button"
                      onClick={() => setShowCc(true)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#2563eb",
                        fontSize: "11.5px",
                        cursor: "pointer",
                        padding: 0,
                        fontWeight: 500,
                      }}
                    >
                      + Añadir CC
                    </button>
                  )}
                </div>
                <div
                  className="input-with-icon-clean"
                  style={{ position: "relative" }}
                >
                  <User
                    size={15}
                    style={{
                      position: "absolute",
                      left: "11px",
                      color: "#94a3b8",
                    }}
                  />
                  <input
                    id="email-recipient"
                    type="email"
                    required
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    disabled={sending}
                    style={{
                      width: "100%",
                      padding: "8px 12px 8px 34px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "13px",
                    }}
                  />
                </div>
                {/* Contact Quick Switches */}
                {(hasDistinctContactEmail || hasDistinctCustomerEmail) && (
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      flexWrap: "wrap",
                      marginTop: "2px",
                    }}
                  >
                    {hasDistinctContactEmail && (
                      <button
                        type="button"
                        onClick={() => setRecipient(storedContactEmail)}
                        style={{
                          background: "#e7ede9",
                          border: "1px solid #bfdbfe",
                          color: "#5c7a74",
                          fontSize: "11px",
                          borderRadius: "4px",
                          padding: "2px 6px",
                          cursor: "pointer",
                        }}
                      >
                        Usar email de contacto: {storedContactEmail}
                      </button>
                    )}
                    {hasDistinctCustomerEmail && (
                      <button
                        type="button"
                        onClick={() => setRecipient(customerHeaderEmail)}
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e4e2dc",
                          color: "#64748b",
                          fontSize: "11px",
                          borderRadius: "4px",
                          padding: "2px 6px",
                          cursor: "pointer",
                        }}
                      >
                        Usar email de empresa: {customerHeaderEmail}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* CC Field (Collapsible) */}
              {showCc && (
                <div className="form-group" style={{ gap: "4px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <label
                      htmlFor="email-cc"
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#475569",
                        margin: 0,
                      }}
                    >
                      En copia (CC)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCc(false);
                        setCc("");
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#94a3b8",
                        fontSize: "11px",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Quitar CC
                    </button>
                  </div>
                  <div
                    className="input-with-icon-clean"
                    style={{ position: "relative" }}
                  >
                    <AtSign
                      size={15}
                      style={{
                        position: "absolute",
                        left: "11px",
                        color: "#94a3b8",
                      }}
                    />
                    <input
                      id="email-cc"
                      type="text"
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      placeholder="copia@empresa.com"
                      disabled={sending}
                      style={{
                        width: "100%",
                        padding: "7px 12px 7px 34px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "12.5px",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Subject Field */}
              <div className="form-group" style={{ gap: "4px" }}>
                <label
                  htmlFor="email-subject"
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#334155",
                    margin: 0,
                  }}
                >
                  Asunto <strong style={{ color: "#ef4444" }}>*</strong>
                </label>
                <input
                  id="email-subject"
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Asunto del correo comercial..."
                  disabled={sending}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                />
              </div>

              {/* Message Body Field */}
              <div className="form-group" style={{ gap: "4px" }}>
                <label
                  htmlFor="email-message"
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#334155",
                    margin: 0,
                  }}
                >
                  Cuerpo del mensaje
                </label>
                <textarea
                  id="email-message"
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={sending}
                  placeholder="Redacta el mensaje..."
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "13px",
                    lineHeight: "1.5",
                    fontFamily: "inherit",
                  }}
                />
              </div>
            </>
          ) : (
            /* Email Visual Preview Mode */
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e4e2dc",
                borderRadius: "8px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                fontSize: "13px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  paddingBottom: "12px",
                  borderBottom: "1px solid #efeee9",
                }}
              >
                <div style={{ display: "flex", gap: "8px" }}>
                  <span
                    style={{
                      color: "#64748b",
                      fontWeight: 600,
                      minWidth: "55px",
                    }}
                  >
                    De:
                  </span>
                  <span style={{ color: "#0f172a" }}>
                    Departamento Comercial &lt;ventas@empresa.com&gt;
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <span
                    style={{
                      color: "#64748b",
                      fontWeight: 600,
                      minWidth: "55px",
                    }}
                  >
                    Para:
                  </span>
                  <span style={{ color: "#0f172a", fontWeight: 600 }}>
                    {effectiveRecipientName} &lt;
                    {recipient || "sin especificar"}&gt;
                  </span>
                </div>
                {cc && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <span
                      style={{
                        color: "#64748b",
                        fontWeight: 600,
                        minWidth: "55px",
                      }}
                    >
                      CC:
                    </span>
                    <span style={{ color: "#475569" }}>{cc}</span>
                  </div>
                )}
                <div style={{ display: "flex", gap: "8px" }}>
                  <span
                    style={{
                      color: "#64748b",
                      fontWeight: 600,
                      minWidth: "55px",
                    }}
                  >
                    Asunto:
                  </span>
                  <span style={{ color: "#0f172a", fontWeight: 700 }}>
                    {subject}
                  </span>
                </div>
              </div>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                  color: "#1e293b",
                  background: "#f8fafc",
                  padding: "12px 14px",
                  borderRadius: "6px",
                  border: "1px solid #efeee9",
                  minHeight: "130px",
                }}
              >
                {message}
              </div>
            </div>
          )}

          {/* PDF Official Attachment Card */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderRadius: "8px",
              border: attachPdf ? "1px solid #bfdbfe" : "1px dashed #cbd5e1",
              background: attachPdf ? "#e7ede9" : "#f8fafc",
              transition: "all 0.15s ease",
            }}
          >
            <label
              htmlFor="attach-pdf-checkbox"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                cursor: "pointer",
                userSelect: "none",
                margin: 0,
                flex: 1,
              }}
            >
              <input
                id="attach-pdf-checkbox"
                type="checkbox"
                checked={attachPdf}
                onChange={(e) => setAttachPdf(e.target.checked)}
                disabled={sending}
                style={{
                  width: "16px",
                  height: "16px",
                  accentColor: "#2563eb",
                  cursor: "pointer",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  flex: 1,
                }}
              >
                <div
                  style={{
                    background: "#c4897a",
                    color: "#fff",
                    padding: "2px 5px",
                    borderRadius: "4px",
                    fontSize: "10px",
                    fontWeight: 800,
                    letterSpacing: "0.04em",
                  }}
                >
                  PDF
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    {quotation.code}.pdf
                  </span>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    Documento oficial con desglose de partidas y condiciones
                    económicas
                  </span>
                </div>
              </div>
            </label>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginLeft: "12px",
              }}
            >
              <button
                type="button"
                onClick={() => setShowPdfPreviewModal(true)}
                style={{
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "5px",
                  padding: "4px 8px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  color: "#2563eb",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
                title="Ver documento PDF que se adjuntará"
              >
                <Eye size={13} /> Ver PDF
              </button>
              <button
                type="button"
                onClick={() =>
                  void generateAndDownloadQuotationPdf(quotation.id)
                }
                style={{
                  background: "#fff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "5px",
                  padding: "4px 8px",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  color: "#475569",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                }}
                title="Descargar archivo PDF"
              >
                <Download size={13} />
              </button>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div
            className="modal-actions-footer"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: "12px",
              borderTop: "1px solid #e4e2dc",
              marginTop: "4px",
            }}
          >
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
              disabled={sending}
              style={{ padding: "8px 14px", fontSize: "13px" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={sending}
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "1px solid #5c7a74",
                padding: "8px 18px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "6px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 1px 2px rgba(37, 99, 235, 0.2)",
                cursor: sending ? "not-allowed" : "pointer",
              }}
            >
              {sending ? (
                <>
                  <Loader2 size={16} className="spinner-icon" />
                  <span>Enviando presupuesto...</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>Enviar y marcar como Enviado</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {showPdfPreviewModal && (
        <QuotationPdfPreviewModal
          isOpen={showPdfPreviewModal}
          onClose={() => setShowPdfPreviewModal(false)}
          quotationId={quotation.id}
          quotationCode={quotation.code}
        />
      )}
    </div>
  );
}
