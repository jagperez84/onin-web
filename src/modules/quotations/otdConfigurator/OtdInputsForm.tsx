import React from "react";
import { Ruler, Sliders } from "lucide-react";
import type { OtdRuntimeData } from "../../../services/otd/otdCalculationService";

export type OtdInputsFormProps = {
  runtimeData: OtdRuntimeData;
  values: Record<string, string>;
  quantity: number;
  notes: string;
  onValueChange: (code: string, value: string) => void;
  onQuantityChange: (qty: number) => void;
  onNotesChange: (notes: string) => void;
};

export function OtdInputsForm({
  runtimeData,
  values,
  quantity,
  notes,
  onValueChange,
  onQuantityChange,
  onNotesChange,
}: OtdInputsFormProps) {
  const hasDimensions = runtimeData.selections.some(
    (s) => s.is_dimension || s.selection_type === "NUMBER",
  );

  const hasOptions = runtimeData.selections.some(
    (s) => !s.is_dimension && s.selection_type !== "NUMBER",
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      {/* Dimensions Section */}
      {hasDimensions && (
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e4e2dc",
            borderRadius: "10px",
            padding: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
              color: "#0f172a",
            }}
          >
            <Ruler size={16} style={{ color: "#0284c7" }} />
            <h4
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.02em",
              }}
            >
              1. Medidas & Dimensiones
              {runtimeData?.workUnit
                ? ` (${runtimeData.workUnit.symbol || runtimeData.workUnit.code})`
                : ""}
            </h4>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "12px",
            }}
          >
            {runtimeData.selections
              .filter((s) => s.is_dimension || s.selection_type === "NUMBER")
              .map((s) => {
                const val = values[s.code] ?? "";
                return (
                  <div
                    key={s.id || s.code}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#334155",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>{s.name || s.code}</span>
                      {s.required && (
                        <span
                          style={{
                            color: "#ef4444",
                            fontSize: "11px",
                          }}
                        >
                          * Obligatorio
                        </span>
                      )}
                    </label>
                    <div style={{ position: "relative" }}>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        placeholder="Ej: 4000"
                        value={val}
                        onChange={(e) => onValueChange(s.code, e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 40px 8px 12px",
                          borderRadius: "6px",
                          border: `1px solid ${!val && s.required ? "#fca5a5" : "#cbd5e1"}`,
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "#0f172a",
                        }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          right: "10px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#64748b",
                        }}
                      >
                        {s.unit?.symbol ||
                          s.unit?.code ||
                          runtimeData?.workUnit?.symbol ||
                          runtimeData?.workUnit?.code ||
                          ""}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Option Selections Section */}
      {hasOptions && (
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e4e2dc",
            borderRadius: "10px",
            padding: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
              color: "#0f172a",
            }}
          >
            <Sliders size={16} style={{ color: "#0284c7" }} />
            <h4
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.02em",
              }}
            >
              2. Opciones & Personalización
            </h4>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {runtimeData.selections
              .filter((s) => !s.is_dimension && s.selection_type !== "NUMBER")
              .map((s) => {
                const val = values[s.code] ?? "";
                if (s.selection_type === "OPTION") {
                  return (
                    <div
                      key={s.id || s.code}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "#334155",
                        }}
                      >
                        {s.name || s.code}
                        {s.required && (
                          <span
                            style={{
                              color: "#ef4444",
                              marginLeft: "4px",
                            }}
                          >
                            *
                          </span>
                        )}
                      </label>
                      <select
                        value={val}
                        onChange={(e) => onValueChange(s.code, e.target.value)}
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "13px",
                          background: "#ffffff",
                          color: "#0f172a",
                        }}
                      >
                        {s.options.map((opt) => (
                          <option
                            key={opt.id || opt.code}
                            value={opt.value ?? opt.code}
                          >
                            {opt.label || opt.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                if (s.selection_type === "BOOLEAN") {
                  return (
                    <label
                      key={s.id || s.code}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 12px",
                        background: "#ffffff",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 500,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={val === "true" || val === "1"}
                        onChange={(e) =>
                          onValueChange(
                            s.code,
                            e.target.checked ? "true" : "false",
                          )
                        }
                      />
                      <span>{s.name || s.code}</span>
                    </label>
                  );
                }

                return (
                  <div
                    key={s.id || s.code}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#334155",
                      }}
                    >
                      {s.name || s.code}
                    </label>
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => onValueChange(s.code, e.target.value)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Quantity and Notes */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px 1fr",
          gap: "12px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <label
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#334155",
            }}
          >
            Cantidad
          </label>
          <input
            type="number"
            min="0.01"
            step="1"
            value={quantity}
            onChange={(e) =>
              onQuantityChange(Math.max(0.01, Number(e.target.value)))
            }
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "14px",
              fontWeight: 600,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <label
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#334155",
            }}
          >
            Notas de la partida
          </label>
          <input
            type="text"
            placeholder="Observaciones de confección o instalación…"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #cbd5e1",
              fontSize: "13px",
            }}
          />
        </div>
      </div>
    </div>
  );
}
