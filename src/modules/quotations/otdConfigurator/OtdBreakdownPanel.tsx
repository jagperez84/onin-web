import React, { useState } from "react";
import {
  Edit3,
  Eye,
  EyeOff,
  Layers,
  Plus,
  RotateCcw,
  Ruler,
  Trash2,
} from "lucide-react";
import type {
  OtdCalculationResult,
  OtdRuntimeData,
  OtdComponentDef,
} from "../../../services/otd/otdCalculationService";
import { euro } from "./types";

export type OtdBreakdownPanelProps = {
  calculation: OtdCalculationResult;
  runtimeData: OtdRuntimeData;
  customComponents: OtdComponentDef[];
  quantity: number;
  onOpenAddNewComponent: () => void;
  onOpenEditComponent: (index: number) => void;
  onToggleComponentActive: (index: number) => void;
  onRemoveComponent: (index: number) => void;
  onResetComponents: () => void;
};

export function OtdBreakdownPanel({
  calculation,
  runtimeData,
  customComponents,
  quantity,
  onOpenAddNewComponent,
  onOpenEditComponent,
  onToggleComponentActive,
  onRemoveComponent,
  onResetComponents,
}: OtdBreakdownPanelProps) {
  const [detailTab, setDetailTab] = useState<"bom" | "cuts" | "vars">("bom");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Main Price Card */}
      <div
        style={{
          background: calculation.isValid
            ? "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)"
            : "#f8fafc",
          color: calculation.isValid ? "#ffffff" : "#475569",
          borderRadius: "12px",
          padding: "18px 20px",
          boxShadow: calculation.isValid
            ? "0 6px 20px rgba(2, 132, 199, 0.25)"
            : "none",
          border: calculation.isValid ? "none" : "1px solid #e4e2dc",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "12px",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                opacity: 0.9,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Precio Calculado en Tiempo Real
            </span>
            <h2
              style={{
                margin: "2px 0 0",
                fontSize: "26px",
                fontWeight: 800,
              }}
            >
              {euro(calculation.totalAmount)}
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  opacity: 0.85,
                  marginLeft: "6px",
                }}
              >
                / ud
              </span>
            </h2>
            {quantity > 1 && (
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  opacity: 0.9,
                  marginTop: "2px",
                }}
              >
                Total ({quantity} uds):{" "}
                {euro(calculation.totalAmount * quantity)}
              </div>
            )}
          </div>

          <span
            style={{
              padding: "4px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 700,
              background: calculation.isValid
                ? "rgba(255,255,255,0.2)"
                : "#fee2e2",
              color: calculation.isValid ? "#ffffff" : "#991b1b",
            }}
          >
            {calculation.isValid ? "Calculado OK" : "Pendiente medidas"}
          </span>
        </div>

        {/* Summary Breakdown Pills */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "8px",
            paddingTop: "10px",
            borderTop: calculation.isValid
              ? "1px solid rgba(255,255,255,0.2)"
              : "1px solid #e4e2dc",
            fontSize: "12px",
          }}
        >
          <div>
            <div style={{ opacity: 0.8 }}>Base Escalado:</div>
            <strong>{euro(calculation.otdBasePrice)}</strong>
            {calculation.otdScaleStepUsed && (
              <div style={{ fontSize: "10px", opacity: 0.75 }}>
                Paso: {calculation.otdScaleStepUsed.dimension_1}
                {calculation.otdScaleStepUsed.dimension_2
                  ? `x${calculation.otdScaleStepUsed.dimension_2}`
                  : ""}{" "}
                {runtimeData?.workUnit?.symbol ||
                  runtimeData?.workUnit?.code ||
                  ""}
              </div>
            )}
          </div>
          <div>
            <div style={{ opacity: 0.8 }}>Mejoras / Componentes:</div>
            <strong>+{euro(calculation.totalIncrements)}</strong>
          </div>
        </div>

        {!calculation.isValid && calculation.requiredMissing.length > 0 && (
          <div
            style={{
              marginTop: "10px",
              padding: "6px 10px",
              background: "#f4eae6",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              color: "#991b1b",
              fontSize: "11.5px",
            }}
          >
            <strong>Faltan datos obligatorios:</strong>{" "}
            {calculation.requiredMissing.join(", ")}
          </div>
        )}
      </div>

      {/* Sub-tabs for Components, Cuts, and Variables */}
      <div
        style={{
          border: "1px solid #e4e2dc",
          borderRadius: "10px",
          overflow: "hidden",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #e4e2dc",
            background: "#f8fafc",
          }}
        >
          <button
            type="button"
            onClick={() => setDetailTab("bom")}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              background: detailTab === "bom" ? "#ffffff" : "transparent",
              fontWeight: detailTab === "bom" ? 700 : 500,
              color: detailTab === "bom" ? "#0284c7" : "#64748b",
              borderBottom: detailTab === "bom" ? "2px solid #0284c7" : "none",
              cursor: "pointer",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <Layers size={14} /> Despiece ({calculation.components.length})
          </button>
          <button
            type="button"
            onClick={() => setDetailTab("cuts")}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              background: detailTab === "cuts" ? "#ffffff" : "transparent",
              fontWeight: detailTab === "cuts" ? 700 : 500,
              color: detailTab === "cuts" ? "#0284c7" : "#64748b",
              borderBottom: detailTab === "cuts" ? "2px solid #0284c7" : "none",
              cursor: "pointer",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <Ruler size={14} /> Medidas de Corte
          </button>
          <button
            type="button"
            onClick={() => setDetailTab("vars")}
            style={{
              flex: 1,
              padding: "10px",
              border: "none",
              background: detailTab === "vars" ? "#ffffff" : "transparent",
              fontWeight: detailTab === "vars" ? 700 : 500,
              color: detailTab === "vars" ? "#0284c7" : "#64748b",
              borderBottom: detailTab === "vars" ? "2px solid #0284c7" : "none",
              cursor: "pointer",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            Variables Calculadas
          </button>
        </div>

        <div style={{ padding: "14px", maxHeight: "280px", overflowY: "auto" }}>
          {/* TAB BOM: Components */}
          {detailTab === "bom" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  Componentes e Incrementos
                </span>
                <div style={{ display: "flex", gap: "6px" }}>
                  {customComponents.length > 0 && (
                    <button
                      type="button"
                      onClick={onResetComponents}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        border: "1px solid #cbd5e1",
                        background: "#ffffff",
                        fontSize: "11px",
                        color: "#64748b",
                        cursor: "pointer",
                      }}
                      title="Restablecer componentes originales del OTD"
                    >
                      <RotateCcw size={12} /> Originales
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onOpenAddNewComponent}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: "1px solid #0284c7",
                      background: "#f0f9ff",
                      color: "#0284c7",
                      fontSize: "11.5px",
                      fontWeight: 700,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Plus size={13} /> Añadir componente
                  </button>
                </div>
              </div>

              {/* Special Scale Matrix Row */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 10px",
                  background: "#efeee9",
                  borderRadius: "6px",
                  border: "1px solid #e4e2dc",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <strong style={{ color: "#0f172a", fontSize: "12px" }}>
                      Escalado Base OTD ({runtimeData.otd.code})
                    </strong>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        background: "#e0f2fe",
                        color: "#0369a1",
                        padding: "1px 5px",
                        borderRadius: "3px",
                      }}
                    >
                      Base
                    </span>
                  </div>
                  <div style={{ color: "#64748b", fontSize: "11px" }}>
                    Tarifa base calculada por medidas (
                    {calculation.otdScaleStepUsed
                      ? `${calculation.otdScaleStepUsed.dimension_1}x${calculation.otdScaleStepUsed.dimension_2 ?? ""}${runtimeData.workUnit ? ` ${runtimeData.workUnit.symbol || runtimeData.workUnit.code}` : ""}`
                      : "Matriz"}
                    )
                  </div>
                </div>
                <div
                  style={{
                    textAlign: "right",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  {euro(calculation.otdBasePrice)}
                </div>
              </div>

              {/* Calculated Component Rows */}
              {calculation.components.map((c, ci) => {
                const compDef = customComponents[ci];
                const isInactive = compDef && !compDef.active;

                return (
                  <div
                    key={c.id || ci}
                    className={`otd-comp-card ${isInactive ? "is-inactive" : ""} ${!c.ok ? "is-error" : ""}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 10px",
                      background: isInactive ? "#f8fafc" : "#ffffff",
                      borderRadius: "6px",
                      border: "1px solid #e4e2dc",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          flexWrap: "wrap",
                        }}
                      >
                        <strong
                          style={{
                            color: isInactive ? "#94a3b8" : "#0f172a",
                            fontSize: "12.5px",
                          }}
                        >
                          {c.product_name || c.description || c.product_code}
                        </strong>
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: "10.5px",
                            color: "#0369a1",
                            background: "#e0f2fe",
                            padding: "1px 5px",
                            borderRadius: "3px",
                            fontWeight: 600,
                          }}
                        >
                          {c.product_code || c.code}
                        </span>
                        {c.characteristic_name && (
                          <span
                            style={{
                              fontSize: "10.5px",
                              color: "#047857",
                              background: "#dcfce7",
                              padding: "1px 5px",
                              borderRadius: "3px",
                              fontWeight: 600,
                            }}
                          >
                            {c.characteristic_name}
                          </span>
                        )}
                        {c.component_type === "IMPROVEMENT" ? (
                          <span
                            style={{
                              fontSize: "10px",
                              color: "#b45309",
                              background: "#fef3c7",
                              padding: "1px 5px",
                              borderRadius: "3px",
                              fontWeight: 700,
                            }}
                          >
                            Mejora (+
                            {c.price_increment_type === "PERCENTAGE"
                              ? `${c.price_increment}%`
                              : euro(c.price_increment)}
                            )
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "10px",
                              color: "#64748b",
                              background: "#efeee9",
                              padding: "1px 5px",
                              borderRadius: "3px",
                            }}
                          >
                            Básico
                          </span>
                        )}
                        {isInactive && (
                          <span
                            style={{
                              fontSize: "10px",
                              color: "#ef4444",
                              fontWeight: 600,
                            }}
                          >
                            (Desactivado)
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          color: "#64748b",
                          fontSize: "11px",
                          marginTop: "2px",
                        }}
                      >
                        Cantidad:{" "}
                        <b>
                          {c.quantity.toLocaleString("es-ES", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          {c.unit_symbol || c.unit_code || "ud"}
                        </b>
                        {c.dimension_list.length > 0 && (
                          <span>
                            {" "}
                            · Cortes:{" "}
                            {c.dimension_list
                              .map(
                                (d) =>
                                  `${d.name}: ${d.value} ${d.unit_symbol || d.unit_code || runtimeData?.workUnit?.symbol || runtimeData?.workUnit?.code || ""}${
                                    d.raw_value != null &&
                                    d.raw_unit_code &&
                                    d.raw_unit_code.toLowerCase() !==
                                      (d.unit_code || runtimeData?.workUnit?.code || "").toLowerCase()
                                      ? ` (de ${d.raw_value} ${d.raw_unit_symbol || d.raw_unit_code})`
                                      : ""
                                  }`,
                              )
                              .join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        marginLeft: "8px",
                      }}
                    >
                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontWeight: 700,
                            color:
                              c.component_type === "IMPROVEMENT" &&
                              c.total_price > 0
                                ? "#6e9b6e"
                                : "#0f172a",
                            fontSize: "12px",
                          }}
                        >
                          {c.component_type === "IMPROVEMENT" &&
                          c.total_price > 0
                            ? `+${euro(c.total_price)}`
                            : euro(c.total_price)}
                        </div>
                        {c.component_type === "IMPROVEMENT" &&
                          c.increment_amount > 0 && (
                            <div
                              style={{
                                fontSize: "10px",
                                color: "#b45309",
                              }}
                            >
                              +{euro(c.increment_amount)} /ud
                            </div>
                          )}
                      </div>

                      <div style={{ display: "flex", gap: "4px" }}>
                        <button
                          type="button"
                          onClick={() => onOpenEditComponent(ci)}
                          className="otd-comp-btn-action"
                          title="Editar este componente"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleComponentActive(ci)}
                          className="otd-comp-btn-action"
                          title={
                            isInactive
                              ? "Activar componente"
                              : "Desactivar componente"
                          }
                        >
                          {isInactive ? (
                            <EyeOff size={13} />
                          ) : (
                            <Eye size={13} />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveComponent(ci)}
                          className="otd-comp-btn-action delete"
                          title="Eliminar de esta configuración"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB CUTS: Cut calculations */}
          {detailTab === "cuts" && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {calculation.components.filter(
                (c) => c.dimension_list.length > 0,
              ).length === 0 ? (
                <p
                  style={{
                    color: "#64748b",
                    margin: 0,
                    textAlign: "center",
                    padding: "16px",
                  }}
                >
                  No hay fórmulas de corte asociadas a los componentes de este
                  OTD.
                </p>
              ) : (
                calculation.components
                  .filter((c) => c.dimension_list.length > 0)
                  .map((c, ci) => (
                    <div
                      key={c.id || ci}
                      style={{
                        padding: "8px 10px",
                        background: "#f8fafc",
                        borderRadius: "6px",
                        border: "1px solid #efeee9",
                      }}
                    >
                      <strong style={{ color: "#0f172a" }}>
                        {c.product_code || c.code}
                      </strong>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                          marginTop: "4px",
                        }}
                      >
                        {c.dimension_list.map((d) => (
                          <span
                            key={d.code}
                            style={{
                              background: "#e0f2fe",
                              color: "#0369a1",
                              padding: "2px 8px",
                              borderRadius: "4px",
                              fontSize: "11px",
                              fontWeight: 600,
                            }}
                          >
                            📐 {d.name}:{" "}
                            {Number(d.value).toLocaleString("es-ES")}{" "}
                            {d.unit_symbol ||
                              d.unit_code ||
                              runtimeData?.workUnit?.symbol ||
                              runtimeData?.workUnit?.code ||
                              ""}
                            {d.raw_value != null &&
                            d.raw_unit_code &&
                            d.raw_unit_code.toLowerCase() !==
                              (
                                d.unit_code ||
                                runtimeData?.workUnit?.code ||
                                ""
                              ).toLowerCase()
                              ? ` (de ${d.raw_value} ${d.raw_unit_symbol || d.raw_unit_code})`
                              : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* TAB VARS: Formulas and runtime context */}
          {detailTab === "vars" && (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "11.5px",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid #e4e2dc",
                    color: "#64748b",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "6px 8px" }}>Variable</th>
                  <th style={{ padding: "6px 8px" }}>Valor Calculado</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(calculation.resolvedVariables).map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td
                      style={{
                        padding: "6px 8px",
                        fontFamily: "monospace",
                        color: "#0369a1",
                      }}
                    >
                      {k}
                    </td>
                    <td
                      style={{
                        padding: "6px 8px",
                        fontWeight: 600,
                      }}
                    >
                      {typeof v === "number"
                        ? Number(v).toLocaleString("es-ES", {
                            maximumFractionDigits: 3,
                          })
                        : String(v)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
