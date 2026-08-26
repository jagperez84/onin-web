import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Layers,
  Scissors,
  Warehouse,
  X,
  CheckCircle2,
  DollarSign,
  Ruler,
  Calendar,
  Calculator,
  TrendingUp,
  Sliders,
  SlidersHorizontal,
  Pencil,
} from "lucide-react";
import type { QuotationLineSnapshot } from "../../services/sales/quotationLineCalculationService";
import type { OtdConfigurationSnapshot } from "../../services/otd/otdCalculationService";
import { formatEuro } from "../../services/catalog/productPricingService";
import "./quotation-configurator.css";

export type QuotationLineSnapshotModalProps = {
  isOpen: boolean;
  onClose: () => void;
  snapshot: QuotationLineSnapshot | OtdConfigurationSnapshot | any | null;
  lineNo?: number;
  quotationId?: number | null;
  lineId?: number | null;
  onEditOtd?: (snapshot: OtdConfigurationSnapshot) => void;
};

export function QuotationLineSnapshotModal({
  isOpen,
  onClose,
  snapshot,
  lineNo = 1,
  quotationId,
  lineId,
  onEditOtd,
}: QuotationLineSnapshotModalProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    "pricing" | "bom" | "cuts" | "stock" | "otd_components" | "otd_variables"
  >("pricing");

  if (!isOpen || !snapshot) return null;

  // Detect if snapshot is an OTD snapshot
  const isOtdSnapshot = Boolean(
    snapshot.otd_code ||
    snapshot.otd_id ||
    snapshot.inputs_display ||
    (snapshot.components &&
      Array.isArray(snapshot.components) &&
      snapshot.components[0]?.product_code),
  );

  if (isOtdSnapshot) {
    const otdSnap = snapshot as OtdConfigurationSnapshot;
    return (
      <div className="configurator-overlay" role="dialog" aria-modal="true">
        <div
          className="configurator-modal"
          style={{ width: "min(920px, 95vw)" }}
        >
          {/* Header */}
          <div className="configurator-header">
            <div className="configurator-header-info">
              <span className="configurator-eyebrow">
                Snapshot OTD Inmutable · Línea {lineNo}
              </span>
              <h2>
                {otdSnap.otd_name}{" "}
                <span
                  style={{
                    fontSize: "15px",
                    color: "#64748b",
                    fontWeight: 400,
                  }}
                >
                  ({otdSnap.otd_code})
                </span>
              </h2>
            </div>
            <button
              type="button"
              className="configurator-close-btn"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>

          {/* Metadata bar */}
          <div
            style={{
              background: "#f8fafc",
              padding: "12px 24px",
              borderBottom: "1px solid #e4e2dc",
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
              fontSize: "12px",
              color: "#64748b",
              alignItems: "center",
            }}
          >
            <div>
              <strong>Creado:</strong>{" "}
              {new Date(otdSnap.created_at).toLocaleString("es-ES")}
            </div>
            <div>
              <strong>Versión:</strong> {otdSnap.snapshot_version || "1.0"}
            </div>
            {(otdSnap.work_unit ||
              otdSnap.work_unit_name ||
              otdSnap.work_unit_code) && (
              <div>
                <strong>Unidad OTD:</strong>{" "}
                {otdSnap.work_unit?.name ||
                  otdSnap.work_unit_name ||
                  otdSnap.work_unit_code}{" "}
                (
                {otdSnap.work_unit?.symbol ||
                  otdSnap.work_unit_symbol ||
                  otdSnap.work_unit?.code ||
                  otdSnap.work_unit_code}
                )
              </div>
            )}
            <div>
              <span className="tag-badge success">
                <CheckCircle2 size={12} /> Configuración OTD Congelada
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div
            className="sub-tabs-bar"
            style={{ padding: "0 24px", margin: "14px 0 0" }}
          >
            <button
              type="button"
              className={`sub-tab-btn ${activeTab === "pricing" || activeTab === "otd_components" ? "active" : ""}`}
              onClick={() => setActiveTab("otd_components")}
            >
              <Layers
                size={14}
                style={{ display: "inline", marginRight: "6px" }}
              />
              Componentes y Escalado ({otdSnap.components?.length || 0})
            </button>
            <button
              type="button"
              className={`sub-tab-btn ${activeTab === "otd_variables" ? "active" : ""}`}
              onClick={() => setActiveTab("otd_variables")}
            >
              <Calculator
                size={14}
                style={{ display: "inline", marginRight: "6px" }}
              />
              Variables y Entradas ({otdSnap.inputs_display?.length || 0})
            </button>
          </div>

          {/* Body */}
          <div className="configurator-body">
            {/* Inputs Overview */}
            <div
              className="configurator-card"
              style={{ padding: "14px 18px", background: "#f8fafc" }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#475569",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Entradas de Oficina Registradas
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "10px",
                  fontSize: "13px",
                }}
              >
                {(otdSnap.inputs_display || []).map((inp, i) => (
                  <div
                    key={i}
                    style={{
                      background: "#fff",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #e4e2dc",
                    }}
                  >
                    <span
                      style={{
                        color: "#64748b",
                        fontSize: "11px",
                        display: "block",
                      }}
                    >
                      {inp.name}
                    </span>
                    <strong style={{ color: "#0f172a" }}>
                      {inp.display_value}
                    </strong>
                  </div>
                ))}
              </div>
            </div>

            {/* TAB: Components and Scaling */}
            {(activeTab === "pricing" || activeTab === "otd_components") && (
              <div>
                <table className="config-data-table">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Tipo</th>
                      <th>Cantidad</th>
                      <th>Medidas Buscadas</th>
                      <th>Escalón / Base</th>
                      <th>Incremento</th>
                      <th>Precio Unit.</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(otdSnap.components || []).map((comp, idx) => (
                      <tr key={idx}>
                        <td>
                          <strong>{comp.product_code}</strong>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>
                            {comp.product_name}
                          </div>
                          {comp.characteristic_name && (
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#0369a1",
                                background: "#e0f2fe",
                                padding: "1px 5px",
                                borderRadius: "3px",
                              }}
                            >
                              {comp.characteristic_name}
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`tag-badge ${comp.component_type === "IMPROVEMENT" ? "warning" : "info"}`}
                          >
                            {comp.component_type === "IMPROVEMENT"
                              ? "Mejora"
                              : "Básico"}
                          </span>
                        </td>
                        <td>
                          {comp.quantity}{" "}
                          <span style={{ fontSize: "11px", color: "#64748b" }}>
                            {comp.unit_symbol || comp.unit_code || "ud"}
                          </span>
                        </td>
                        <td style={{ fontSize: "11px" }}>
                          {comp.dimension_list && comp.dimension_list.length > 0
                            ? comp.dimension_list
                                .map(
                                  (d) =>
                                    `${d.code}: ${d.value} ${d.unit_symbol || d.unit_code || otdSnap.work_unit?.symbol || otdSnap.work_unit_symbol || otdSnap.work_unit?.code || otdSnap.work_unit_code || ""}${
                                      d.raw_value != null &&
                                      d.raw_unit_code &&
                                      d.raw_unit_code.toLowerCase() !==
                                        (d.unit_code || otdSnap.work_unit?.code || otdSnap.work_unit_code || "").toLowerCase()
                                        ? ` (de ${d.raw_value} ${d.raw_unit_symbol || d.raw_unit_code})`
                                        : ""
                                    }`,
                                )
                                .join(" · ")
                            : Object.entries(comp.dimensions || {})
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(" · ") || "—"}
                        </td>
                        <td>
                          {comp.scale_step_used ? (
                            <div>
                              <strong>{formatEuro(comp.base_price)}</strong>
                              <div
                                style={{ fontSize: "10px", color: "#64748b" }}
                              >
                                Paso: {comp.scale_step_used.dimension_1} ×{" "}
                                {comp.scale_step_used.dimension_2 ?? "—"}{" "}
                                {comp.unit_symbol || otdSnap.work_unit?.symbol || otdSnap.work_unit_symbol || otdSnap.work_unit?.code || otdSnap.work_unit_code || ""}
                              </div>
                            </div>
                          ) : (
                            formatEuro(comp.base_price)
                          )}
                        </td>
                        <td>
                          {comp.increment_amount > 0 ? (
                            <span style={{ color: "#b45309", fontWeight: 600 }}>
                              +{formatEuro(comp.increment_amount)}
                              <small
                                style={{
                                  display: "block",
                                  fontSize: "10px",
                                  color: "#78350f",
                                }}
                              >
                                (
                                {comp.price_increment_type === "PERCENTAGE"
                                  ? `${comp.price_increment}%`
                                  : "fijo"}
                                )
                              </small>
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <strong>{formatEuro(comp.unit_price)}</strong>
                        </td>
                        <td>
                          <strong style={{ color: "#0f172a" }}>
                            {formatEuro(comp.total_price)}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB: Variables */}
            {activeTab === "otd_variables" && (
              <div>
                <table className="config-data-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre Variable</th>
                      <th>Fórmula / Expresión</th>
                      <th>Valor Resuelto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(otdSnap.variables_display || []).map((v, i) => (
                      <tr key={i}>
                        <td>
                          <code>{v.code}</code>
                        </td>
                        <td>{v.name}</td>
                        <td>
                          <code>{v.expression || "—"}</code>
                        </td>
                        <td>
                          <strong>
                            {v.value.toLocaleString("es-ES", {
                              maximumFractionDigits: 2,
                            })}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="configurator-footer">
            <div className="configurator-footer-summary">
              <div>
                <span>Total OTD Calculado: </span>
                <strong style={{ color: "#0284c7", fontSize: "18px" }}>
                  {formatEuro(otdSnap.total_amount || 0)}
                </strong>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {otdSnap.otd_id && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    onClose();
                    if (onEditOtd) {
                      onEditOtd(otdSnap);
                    } else {
                      navigate(`/produccion/otd/${otdSnap.otd_id}/runtime`, {
                        state: {
                          snapshot: otdSnap,
                          initialValues: otdSnap.inputs,
                          quotationId,
                          lineId,
                        },
                      });
                    }
                  }}
                  title="Abrir configurador OTD para editar parámetros"
                >
                  <SlidersHorizontal size={14} style={{ marginRight: "6px" }} />
                  Editar en Configurador OTD
                </button>
              )}
              <button
                type="button"
                className="primary-button"
                onClick={onClose}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Standard Product Snapshot
  const standardSnap = snapshot as QuotationLineSnapshot;
  const article = standardSnap.article;
  const pricing = standardSnap.pricing;
  const breakdown = standardSnap.breakdown;
  const cuts = standardSnap.cuts;
  const stock = standardSnap.stock_preview;

  return (
    <div className="configurator-overlay" role="dialog" aria-modal="true">
      <div className="configurator-modal" style={{ width: "min(900px, 94vw)" }}>
        {/* Header */}
        <div className="configurator-header">
          <div className="configurator-header-info">
            <span className="configurator-eyebrow">
              Snapshot de Configuración Inmutable · Línea {lineNo}
            </span>
            <h2>
              {article?.code} ·{" "}
              {article?.commercial_description ||
                article?.technical_description ||
                "Artículo"}
            </h2>
          </div>
          <button
            type="button"
            className="configurator-close-btn"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Snapshot Metadata Bar */}
        <div
          style={{
            background: "#f8fafc",
            padding: "12px 24px",
            borderBottom: "1px solid #e4e2dc",
            display: "flex",
            gap: "16px",
            flexWrap: "wrap",
            fontSize: "12px",
            color: "#64748b",
          }}
        >
          <div>
            <strong>Creado:</strong>{" "}
            {new Date(standardSnap.created_at).toLocaleString("es-ES")}
          </div>
          <div>
            <strong>Versión Snapshot:</strong> {standardSnap.snapshot_version}
          </div>
          <div>
            <span className="tag-badge success">
              <CheckCircle2 size={12} /> Configuración Congelada
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div
          className="sub-tabs-bar"
          style={{ padding: "0 24px", margin: "14px 0 0" }}
        >
          <button
            type="button"
            className={`sub-tab-btn ${activeTab === "pricing" ? "active" : ""}`}
            onClick={() => setActiveTab("pricing")}
          >
            <DollarSign
              size={14}
              style={{ display: "inline", marginRight: "6px" }}
            />
            Desglose Económico
          </button>
          <button
            type="button"
            className={`sub-tab-btn ${activeTab === "bom" ? "active" : ""}`}
            onClick={() => setActiveTab("bom")}
          >
            <Layers
              size={14}
              style={{ display: "inline", marginRight: "6px" }}
            />
            Despiece BOM ({breakdown?.components.length || 0})
          </button>
          <button
            type="button"
            className={`sub-tab-btn ${activeTab === "cuts" ? "active" : ""}`}
            onClick={() => setActiveTab("cuts")}
          >
            <Scissors
              size={14}
              style={{ display: "inline", marginRight: "6px" }}
            />
            Cortes y Mermas (
            {(cuts?.canvas_cuts.length || 0) + (cuts?.profile_cuts.length || 0)}
            )
          </button>
          <button
            type="button"
            className={`sub-tab-btn ${activeTab === "stock" ? "active" : ""}`}
            onClick={() => setActiveTab("stock")}
          >
            <Warehouse
              size={14}
              style={{ display: "inline", marginRight: "6px" }}
            />
            Stock al Presupuestar
          </button>
        </div>

        {/* Modal Body */}
        <div className="configurator-body">
          {/* General Config Overview */}
          <div className="configurator-card" style={{ padding: "12px 16px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
                fontSize: "12px",
              }}
            >
              <div>
                <strong style={{ color: "#475569" }}>Dimensiones:</strong>
                <div>
                  {(standardSnap.dimensions || [])
                    .map((d) => `${d.name}: ${d.value ?? 0} ${d.unit_code}`)
                    .join(" × ") || "Sin dimensiones"}
                </div>
              </div>
              <div>
                <strong style={{ color: "#475569" }}>Variante / Color:</strong>
                <div>
                  {standardSnap.selected_variant?.description ||
                    standardSnap.selected_variant?.code ||
                    "Estándar"}
                </div>
              </div>
              <div>
                <strong style={{ color: "#475569" }}>Características:</strong>
                <div>
                  {(standardSnap.selected_attributes || [])
                    .map((a) => `${a.name}: ${a.value_label}`)
                    .join(", ") || "Sin atributos adicionales"}
                </div>
              </div>
              <div>
                <strong style={{ color: "#475569" }}>Cantidad & Dto:</strong>
                <div>
                  {standardSnap.quantity} {article?.base_unit_code} ·{" "}
                  {pricing?.discount_percent}% Dto.
                </div>
              </div>
            </div>
          </div>

          {/* TAB 1: Pricing */}
          {activeTab === "pricing" && pricing && (
            <div className="pricing-breakdown-card">
              <table className="pricing-steps-table">
                <tbody>
                  {(pricing.explainable_steps || []).map((step, idx) => (
                    <tr
                      key={idx}
                      className={step.highlight ? "highlight-row" : undefined}
                    >
                      <td>
                        {step.label}
                        {step.badge && (
                          <span className="pricing-badge">{step.badge}</span>
                        )}
                        {step.description && (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "#64748b",
                              marginTop: "2px",
                            }}
                          >
                            {step.description}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {step.formatted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB 2: BOM */}
          {activeTab === "bom" && (
            <div>
              {breakdown && breakdown.components.length > 0 ? (
                <table className="config-data-table">
                  <thead>
                    <tr>
                      <th>Componente</th>
                      <th>Fórmula</th>
                      <th>Cantidad</th>
                      <th>Unidad</th>
                      <th>Precio Unit.</th>
                      <th>Coste Unit.</th>
                      <th>Total PVP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.components.map((comp) => (
                      <tr key={comp.id}>
                        <td>
                          <strong>{comp.code}</strong>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>
                            {comp.description}
                          </div>
                        </td>
                        <td>
                          <code
                            style={{
                              fontSize: "11px",
                              background: "#efeee9",
                              padding: "2px 4px",
                              borderRadius: "4px",
                            }}
                          >
                            {comp.quantity_expression}
                          </code>
                        </td>
                        <td>{comp.quantity}</td>
                        <td>{comp.unit_code}</td>
                        <td>{formatEuro(comp.unit_price)}</td>
                        <td>{formatEuro(comp.unit_cost)}</td>
                        <td>
                          <strong>
                            {comp.add_pvp
                              ? formatEuro(comp.total_price)
                              : "Incluido"}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "#64748b", fontSize: "13px" }}>
                  Sin despiece en snapshot.
                </p>
              )}
            </div>
          )}

          {/* TAB 3: Cuts */}
          {activeTab === "cuts" && (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "16px" }}
            >
              {cuts?.canvas_cuts && cuts.canvas_cuts.length > 0 && (
                <div>
                  <h4
                    style={{
                      margin: "0 0 8px",
                      fontSize: "13px",
                      color: "#0f172a",
                    }}
                  >
                    Cortes de Lona / Tejido
                  </h4>
                  <table className="config-data-table">
                    <thead>
                      <tr>
                        <th>Pieza</th>
                        <th>Color</th>
                        <th>Corte Total</th>
                        <th>Paños</th>
                        <th>Superficie</th>
                        <th>Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuts.canvas_cuts.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.name}</strong>
                          </td>
                          <td>{c.fabric_color}</td>
                          <td>
                            <strong>
                              {c.cut_width} m × {c.cut_height} m
                            </strong>
                          </td>
                          <td>{c.cloth_strips_count}</td>
                          <td>{c.total_area_m2} m²</td>
                          <td style={{ fontSize: "11px", color: "#64748b" }}>
                            {c.confection_notes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {cuts?.profile_cuts && cuts.profile_cuts.length > 0 && (
                <div>
                  <h4
                    style={{
                      margin: "0 0 8px",
                      fontSize: "13px",
                      color: "#0f172a",
                    }}
                  >
                    Cortes de Perfiles
                  </h4>
                  <table className="config-data-table">
                    <thead>
                      <tr>
                        <th>Perfil</th>
                        <th>Longitud</th>
                        <th>Piezas</th>
                        <th>Barras</th>
                        <th>Resto / Merma</th>
                        <th>Aprovechable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuts.profile_cuts.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <strong>{p.profile_code}</strong> · {p.profile_name}
                          </td>
                          <td>
                            <strong>
                              {p.cut_length} {p.unit}
                            </strong>
                          </td>
                          <td>{p.quantity_pieces}</td>
                          <td>{p.bars_required}</td>
                          <td>
                            {p.waste_scrap_total} {p.unit || "mm"}
                          </td>
                          <td>
                            {p.is_reusable_remainder ? (
                              <span className="tag-badge success">
                                Aprovechable
                              </span>
                            ) : (
                              <span className="tag-badge warning">Merma</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Stock */}
          {activeTab === "stock" && (
            <div>
              {stock ? (
                <table className="config-data-table">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Almacén</th>
                      <th>Stock Registrado</th>
                      <th>Reservado</th>
                      <th>Disponible</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>{stock.mainProduct.productCode}</strong>
                      </td>
                      <td>{stock.warehouseName}</td>
                      <td>{stock.mainProduct.inStock}</td>
                      <td>{stock.mainProduct.reserved}</td>
                      <td>
                        <strong>{stock.mainProduct.available}</strong>
                      </td>
                      <td>
                        <span
                          className={`tag-badge ${stock.mainProduct.hasSufficientStock ? "success" : "danger"}`}
                        >
                          {stock.mainProduct.hasSufficientStock
                            ? "Disponible"
                            : "Falta Stock"}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "#64748b", fontSize: "13px" }}>
                  Sin seguimiento de stock en este snapshot.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="configurator-footer">
          <div className="configurator-footer-summary">
            <div>
              <span>Precio Unitario: </span>
              <strong>{formatEuro(pricing?.unit_price ?? 0)}</strong>
            </div>
            <div>
              <span>Total Línea: </span>
              <strong style={{ color: "#0284c7" }}>
                {formatEuro(pricing?.total_amount ?? 0)}
              </strong>
            </div>
          </div>
          <button type="button" className="primary-button" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
