import { useState, useMemo, useEffect } from "react";
import {
  User,
  Building,
  Mail,
  Phone,
  Briefcase,
  Search,
  Check,
  X,
  Edit3,
  UserCheck,
  AlertCircle,
} from "lucide-react";
import type {
  CustomerContactItem,
  CustomerContactDataResult,
} from "../../services/sales/quotationCreationRepository";

export type SelectedContactData = {
  contact_id: number | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customerData: CustomerContactDataResult;
  selectedContactId?: number | null;
  initialContactName?: string;
  initialContactEmail?: string;
  initialContactPhone?: string;
  onSelectContact: (contact: SelectedContactData) => void | Promise<void>;
}

export function QuotationContactSelectModal({
  isOpen,
  onClose,
  customerData,
  selectedContactId = null,
  initialContactName = "",
  initialContactEmail = "",
  initialContactPhone = "",
  onSelectContact,
}: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [pickedId, setPickedId] = useState<
    number | "company" | "custom" | null
  >(
    selectedContactId !== null && selectedContactId !== undefined
      ? selectedContactId
      : "company",
  );
  const [customName, setCustomName] = useState(initialContactName || "");
  const [customEmail, setCustomEmail] = useState(initialContactEmail || "");
  const [customPhone, setCustomPhone] = useState(initialContactPhone || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (selectedContactId !== null && selectedContactId !== undefined) {
        setPickedId(selectedContactId);
      } else if (
        initialContactName &&
        initialContactName !== customerData.company_name
      ) {
        setPickedId("custom");
      } else {
        setPickedId("company");
      }
      setCustomName(initialContactName || "");
      setCustomEmail(initialContactEmail || "");
      setCustomPhone(initialContactPhone || "");
      setSearchTerm("");
    }
  }, [
    isOpen,
    selectedContactId,
    initialContactName,
    initialContactEmail,
    initialContactPhone,
    customerData.company_name,
  ]);

  const filteredContacts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return customerData.contacts;
    return customerData.contacts.filter((c) => {
      const name = `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
      const email = (c.email || "").toLowerCase();
      const title = (c.job_title || "").toLowerCase();
      const dept = (c.department || "").toLowerCase();
      const phone = (c.phone || c.mobile || "").toLowerCase();
      return (
        name.includes(term) ||
        email.includes(term) ||
        title.includes(term) ||
        dept.includes(term) ||
        phone.includes(term)
      );
    });
  }, [customerData.contacts, searchTerm]);

  if (!isOpen) return null;

  const handleChooseCompany = async () => {
    setIsSubmitting(true);
    try {
      await onSelectContact({
        contact_id: null,
        contact_name: customerData.company_name,
        contact_email: customerData.header_email,
        contact_phone: customerData.header_phone,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChooseContact = async (c: CustomerContactItem) => {
    setIsSubmitting(true);
    try {
      const fullName =
        [c.first_name, c.last_name].filter(Boolean).join(" ") || "Contacto";
      await onSelectContact({
        contact_id: c.id,
        contact_name: fullName,
        contact_email: c.email || "",
        contact_phone: c.phone || c.mobile || "",
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChooseCustom = async () => {
    setIsSubmitting(true);
    try {
      await onSelectContact({
        contact_id: null,
        contact_name: customName.trim() || customerData.company_name,
        contact_email: customEmail.trim(),
        contact_phone: customPhone.trim(),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (pickedId === "custom") {
      await handleChooseCustom();
    } else if (pickedId === "company" || pickedId === null) {
      await handleChooseCompany();
    } else {
      const found = customerData.contacts.find((c) => c.id === pickedId);
      if (found) {
        await handleChooseContact(found);
      } else {
        await handleChooseCompany();
      }
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
        className="contact-select-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface, #ffffff)",
          borderRadius: "14px",
          maxWidth: "640px",
          width: "100%",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px 24px",
            borderBottom: "1px solid var(--color-border, #e4e2dc)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "4px",
              }}
            >
              <div
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "8px",
                  background: "var(--color-primary-50, #e7ede9)",
                  color: "var(--color-primary, #2563eb)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <UserCheck size={18} />
              </div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "var(--color-text, #1e293b)",
                }}
              >
                Persona de contacto del presupuesto
              </h3>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                color: "var(--color-text-muted, #64748b)",
              }}
            >
              Cliente:{" "}
              <strong>{customerData.company_name || "Empresa cliente"}</strong>.
              Selecciona un contacto o define uno específico.
            </p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            style={{ padding: "6px", minWidth: "auto", borderRadius: "6px" }}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab buttons */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--color-border, #e4e2dc)",
            background: "#f8fafc",
            padding: "4px 12px 0 12px",
            gap: "6px",
          }}
        >
          <button
            type="button"
            onClick={() =>
              setPickedId(pickedId === "custom" ? "company" : pickedId)
            }
            style={{
              padding: "8px 14px",
              border: "none",
              background: pickedId !== "custom" ? "#ffffff" : "transparent",
              borderTopLeftRadius: "8px",
              borderTopRightRadius: "8px",
              fontWeight: pickedId !== "custom" ? 600 : 500,
              fontSize: "0.85rem",
              color: pickedId !== "custom" ? "#2563eb" : "#64748b",
              borderBottom:
                pickedId !== "custom"
                  ? "2px solid #2563eb"
                  : "2px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <User size={15} /> Contactos del Cliente (
            {customerData.contacts.length + 1})
          </button>
          <button
            type="button"
            onClick={() => setPickedId("custom")}
            style={{
              padding: "8px 14px",
              border: "none",
              background: pickedId === "custom" ? "#ffffff" : "transparent",
              borderTopLeftRadius: "8px",
              borderTopRightRadius: "8px",
              fontWeight: pickedId === "custom" ? 600 : 500,
              fontSize: "0.85rem",
              color: pickedId === "custom" ? "#2563eb" : "#64748b",
              borderBottom:
                pickedId === "custom"
                  ? "2px solid #2563eb"
                  : "2px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Edit3 size={15} /> Personalizado / Manual
          </button>
        </div>

        {/* Body based on tab */}
        {pickedId === "custom" ? (
          <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
            <div
              style={{
                background: "#e7ede9",
                borderRadius: "8px",
                padding: "12px 16px",
                marginBottom: "16px",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                fontSize: "0.85rem",
                color: "#1e40af",
              }}
            >
              <AlertCircle
                size={16}
                style={{ marginTop: "2px", flexShrink: 0 }}
              />
              <span>
                Introduce directamente los datos de la persona de contacto para
                este presupuesto sin necesidad de guardarlo en la agenda del
                cliente.
              </span>
            </div>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: "#334155",
                    marginBottom: "6px",
                  }}
                >
                  Nombre y Apellidos de contacto
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Ej. Juan Pérez (Dpto. Compras)"
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.9rem",
                  }}
                  autoFocus
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Correo electrónico
                  </label>
                  <input
                    type="email"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    placeholder="contacto@empresa.com"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color: "#334155",
                      marginBottom: "6px",
                    }}
                  >
                    Teléfono directo
                  </label>
                  <input
                    type="text"
                    value={customPhone}
                    onChange={(e) => setCustomPhone(e.target.value)}
                    placeholder="+34 600 000 000"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.9rem",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Search & Filter */}
            {customerData.contacts.length > 2 && (
              <div
                style={{
                  padding: "12px 24px",
                  borderBottom: "1px solid var(--color-border, #e4e2dc)",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <Search
                    size={16}
                    style={{
                      position: "absolute",
                      left: "12px",
                      color: "var(--color-text-muted, #94a3b8)",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, cargo, email..."
                    style={{
                      width: "100%",
                      padding: "8px 12px 8px 36px",
                      borderRadius: "6px",
                      border: "1px solid var(--color-border, #cbd5e1)",
                      fontSize: "0.875rem",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Contacts list */}
            <div
              style={{
                padding: "16px 24px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                flex: 1,
              }}
            >
              {/* Option: Company General Header */}
              <div
                onClick={() => setPickedId("company")}
                onDoubleClick={() => void handleChooseCompany()}
                style={{
                  padding: "14px 16px",
                  borderRadius: "8px",
                  border:
                    pickedId === "company"
                      ? "2px solid var(--color-primary, #2563eb)"
                      : "1px solid var(--color-border, #e4e2dc)",
                  background:
                    pickedId === "company"
                      ? "#e7ede9"
                      : "var(--color-surface, #ffffff)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "6px",
                      background: "#efeee9",
                      color: "#475569",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: "2px",
                    }}
                  >
                    <Building size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <strong
                        style={{
                          fontSize: "0.95rem",
                          color: "var(--color-text, #0f172a)",
                        }}
                      >
                        {customerData.company_name || "Empresa cliente"}
                      </strong>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          background: "#e4e2dc",
                          color: "#334155",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: 500,
                        }}
                      >
                        Cabecera general
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "14px",
                        marginTop: "6px",
                        fontSize: "0.85rem",
                        color: "var(--color-text-muted, #64748b)",
                      }}
                    >
                      {customerData.header_email && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Mail size={13} /> {customerData.header_email}
                        </span>
                      )}
                      {customerData.header_phone && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          <Phone size={13} /> {customerData.header_phone}
                        </span>
                      )}
                      {!customerData.header_email &&
                        !customerData.header_phone && (
                          <span style={{ fontStyle: "italic" }}>
                            Sin email ni teléfono en cabecera
                          </span>
                        )}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "50%",
                    border:
                      pickedId === "company"
                        ? "6px solid var(--color-primary, #2563eb)"
                        : "2px solid #cbd5e1",
                    flexShrink: 0,
                    marginTop: "6px",
                  }}
                />
              </div>

              {customerData.contacts.length > 0 && (
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--color-text-muted, #94a3b8)",
                    marginTop: "6px",
                    marginBottom: "2px",
                  }}
                >
                  Contactos de la empresa ({filteredContacts.length})
                </div>
              )}

              {/* Contact Items */}
              {filteredContacts.map((c) => {
                const fullName =
                  [c.first_name, c.last_name].filter(Boolean).join(" ") ||
                  "Contacto sin nombre";
                const isSelected = pickedId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setPickedId(c.id)}
                    onDoubleClick={() => void handleChooseContact(c)}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "8px",
                      border: isSelected
                        ? "2px solid var(--color-primary, #2563eb)"
                        : "1px solid var(--color-border, #e4e2dc)",
                      background: isSelected
                        ? "#e7ede9"
                        : "var(--color-surface, #ffffff)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "6px",
                          background: isSelected ? "#dbeafe" : "#f8fafc",
                          color: isSelected ? "#5c7a74" : "#64748b",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: "2px",
                        }}
                      >
                        <User size={18} />
                      </div>
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <strong
                            style={{
                              fontSize: "0.95rem",
                              color: "var(--color-text, #0f172a)",
                            }}
                          >
                            {fullName}
                          </strong>
                          {c.job_title && (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                background: "#e0f2fe",
                                color: "#0369a1",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontWeight: 500,
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <Briefcase size={11} /> {c.job_title}
                            </span>
                          )}
                          {c.department && (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                background: "#efeee9",
                                color: "#475569",
                                padding: "2px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              {c.department}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "14px",
                            marginTop: "6px",
                            fontSize: "0.85rem",
                            color: "var(--color-text-muted, #64748b)",
                          }}
                        >
                          {c.email && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <Mail size={13} /> {c.email}
                            </span>
                          )}
                          {(c.phone || c.mobile) && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              <Phone size={13} />{" "}
                              {[c.phone, c.mobile].filter(Boolean).join(" / ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        border: isSelected
                          ? "6px solid var(--color-primary, #2563eb)"
                          : "2px solid #cbd5e1",
                        flexShrink: 0,
                        marginTop: "6px",
                      }}
                    />
                  </div>
                );
              })}

              {filteredContacts.length === 0 && searchTerm && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "24px 12px",
                    color: "#64748b",
                    fontSize: "0.875rem",
                  }}
                >
                  No se encontraron contactos que coincidan con &quot;
                  {searchTerm}&quot;.
                </div>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--color-border, #e4e2dc)",
            background: "var(--color-surface-subtle, #f8fafc)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting}
          >
            <Check size={16} />{" "}
            {isSubmitting ? "Guardando..." : "Aplicar persona de contacto"}
          </button>
        </div>
      </div>
    </div>
  );
}
