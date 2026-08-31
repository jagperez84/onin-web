import React, { useState, useEffect } from "react";
import { CheckCircle2, Package, Search, X, Ruler, Loader2 } from "lucide-react";
import {
  searchOninProducts,
  fetchProductForOtdComponent,
  type OtdSelection,
  type OtdVariable,
} from "../../../services/otd/otdCalculationService";
import type {
  Product,
  ProductCharacteristic,
} from "../../../services/catalog/productRepository";
import type { EditingCompModalState } from "./types";
import { FormulaPredictiveInput } from "../../otd/FormulaPredictiveInput";

export type OtdComponentEditModalProps = {
  editingCompModal: NonNullable<EditingCompModalState>;
  onClose: () => void;
  onSave: () => void;
  onUpdateComp: (comp: NonNullable<EditingCompModalState>["comp"]) => void;
  selections?: OtdSelection[];
  variables?: OtdVariable[];
  workUnitSymbol?: string;
};

export function OtdComponentEditModal({
  editingCompModal,
  onClose,
  onSave,
  onUpdateComp,
  selections = [],
  variables = [],
  workUnitSymbol = "mm",
}: OtdComponentEditModalProps) {
  const [productSearch, setProductSearch] = useState("");
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [compFeedback, setCompFeedback] = useState<string>("");

  const comp = editingCompModal.comp;

  // If component already has a product_id but missing dimensions/characteristics metadata, load them
  useEffect(() => {
    let active = true;
    if (
      comp.product_id &&
      (!comp.dimensions || comp.dimensions.length === 0)
    ) {
      setLoadingDetails(true);
      fetchProductForOtdComponent(comp.product_id)
        .then((loaded) => {
          if (!active) return;
          const initialDimExprs: Record<string, string> = {
            ...(comp.dimension_expressions || {}),
          };
          if (loaded.dimensions && loaded.dimensions.length > 0) {
            loaded.dimensions.forEach((d) => {
              if (initialDimExprs[d.code] === undefined) {
                const matchingSelection = selections.find(
                  (s) =>
                    s.is_dimension &&
                    (s.code.toUpperCase() === d.code.toUpperCase() ||
                      s.name.toLowerCase() === (d.name || "").toLowerCase()),
                );
                initialDimExprs[d.code] = matchingSelection
                  ? matchingSelection.code
                  : d.code;
              }
            });
          }

          onUpdateComp({
            ...comp,
            product: loaded.product,
            dimensions: loaded.dimensions,
            scales: loaded.scales,
            characteristics: loaded.characteristics,
            characteristic_id:
              comp.characteristic_id ??
              (loaded.characteristics.length > 0
                ? loaded.characteristics[0].id
                : null),
            dimension_expressions: initialDimExprs,
          });
        })
        .catch((err) => {
          console.error("Error cargando detalles del producto:", err);
        })
        .finally(() => {
          if (active) setLoadingDetails(false);
        });
    }
    return () => {
      active = false;
    };
  }, [comp.product_id]);

  const searchCatalog = async (query: string) => {
    setProductSearch(query);
    if (!query.trim() || query.length < 2) {
      setProductResults([]);
      return;
    }
    setSearchingProducts(true);
    try {
      const results = await searchOninProducts(query);
      setProductResults(results as any);
    } catch {
      setProductResults([]);
    } finally {
      setSearchingProducts(false);
    }
  };

  const handleSelectProductForComp = async (prod: Product) => {
    setLoadingDetails(true);
    try {
      const loaded = await fetchProductForOtdComponent(prod.id);
      const initialDimExprs: Record<string, string> = {
        ...(comp.dimension_expressions || {}),
      };
      if (loaded.dimensions && loaded.dimensions.length > 0) {
        loaded.dimensions.forEach((d) => {
          const matchingSelection = selections.find(
            (s) =>
              s.is_dimension &&
              (s.code.toUpperCase() === d.code.toUpperCase() ||
                s.name.toLowerCase() === (d.name || "").toLowerCase()),
          );
          initialDimExprs[d.code] = matchingSelection
            ? matchingSelection.code
            : d.code;
        });
      }

      onUpdateComp({
        ...comp,
        product_id: prod.id,
        code: prod.code,
        description:
          prod.commercial_description || prod.technical_description || null,
        product: loaded.product,
        dimensions: loaded.dimensions,
        scales: loaded.scales,
        characteristics: loaded.characteristics,
        characteristic_id:
          loaded.characteristics.length > 0
            ? loaded.characteristics[0].id
            : null,
        dimension_expressions: initialDimExprs,
      });
      setProductResults([]);
      setProductSearch("");
      setCompFeedback(`Artículo asignado: ${prod.code}`);
      setTimeout(() => setCompFeedback(""), 3000);
    } catch {
      onUpdateComp({
        ...comp,
        product_id: prod.id,
        code: prod.code,
        description:
          prod.commercial_description || prod.technical_description || null,
        dimensions: [],
        dimension_expressions: {},
      });
      setProductResults([]);
      setProductSearch("");
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-card">
        <div className="modal-header">
          <div
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                background: "#e0f2fe",
                color: "#0369a1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Package size={18} />
            </div>
            <div>
              <h4
                style={{
                  margin: 0,
                  fontSize: "15px",
                  fontWeight: 700,
                  color: "#0f172a",
                }}
              >
                {editingCompModal.index === null
                  ? "Añadir Componente al OTD"
                  : "Editar Componente"}
              </h4>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "12px",
                  color: "#64748b",
                }}
              >
                Personaliza este componente para la línea actual del
                presupuesto.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {compFeedback && (
            <div
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                background: "#ebf1ea",
                border: "1px solid #bbf7d0",
                color: "#15803d",
                fontSize: "12px",
              }}
            >
              {compFeedback}
            </div>
          )}

          {/* Product Catalog Search */}
          <div>
            <label
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#334155",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Buscar Artículo en Catálogo
            </label>
            <div style={{ position: "relative" }}>
              <Search
                size={15}
                style={{
                  position: "absolute",
                  left: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#64748b",
                }}
              />
              <input
                type="text"
                placeholder="Escribe código o descripción para buscar…"
                value={productSearch}
                onChange={(e) => searchCatalog(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 30px 8px 32px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                }}
              />
              {searchingProducts && (
                <span
                  style={{
                    position: "absolute",
                    right: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "11px",
                    color: "#64748b",
                  }}
                >
                  Buscando…
                </span>
              )}
            </div>

            {productResults.length > 0 && (
              <div className="otd-search-results-dropdown">
                {productResults.map((p) => (
                  <div
                    key={p.id}
                    className="otd-search-result-item"
                    onClick={() => handleSelectProductForComp(p)}
                  >
                    <div>
                      <strong>{p.code}</strong>
                      <div style={{ fontSize: "11.5px", color: "var(--muted)" }}>
                        {p.commercial_description ||
                          p.technical_description ||
                          "Sin descripción"}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#0284c7",
                      }}
                    >
                      Seleccionar
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected Product Card */}
          <div
            style={{
              padding: "12px",
              background: "#f8fafc",
              border: "1px solid #e4e2dc",
              borderRadius: "8px",
            }}
          >
            <div
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "#64748b",
                textTransform: "uppercase",
              }}
            >
              Artículo Asignado
            </div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 700,
                color: "#0f172a",
                marginTop: "2px",
              }}
            >
              {editingCompModal.comp.product?.commercial_description ||
                editingCompModal.comp.description ||
                editingCompModal.comp.code ||
                "Ningún artículo seleccionado"}
            </div>
            <div
              style={{
                fontSize: "11.5px",
                color: "#64748b",
                marginTop: "2px",
              }}
            >
              Código:{" "}
              <code style={{ color: "var(--status-info-fg)", fontWeight: 600 }}>
                {editingCompModal.comp.product?.code ||
                  editingCompModal.comp.code ||
                  "—"}
              </code>
            </div>
          </div>

          {/* Characteristic / Finish */}
          <div>
            <label
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#334155",
                display: "block",
                marginBottom: "4px",
              }}
            >
              Acabado / Característica
            </label>
            <select
              value={editingCompModal.comp.characteristic_id ?? ""}
              onChange={(e) =>
                onUpdateComp({
                  ...editingCompModal.comp,
                  characteristic_id: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                fontSize: "13px",
                background: "#ffffff",
              }}
            >
              <option value="">Sin acabado específico (estándar)</option>
              {(editingCompModal.comp.characteristics ?? []).map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.code} — {ch.description || ch.code}
                </option>
              ))}
            </select>
          </div>

          {/* Component Type (Basic vs Improvement) */}
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
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#334155",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Tipo de Componente
              </label>
              <select
                value={editingCompModal.comp.component_type}
                onChange={(e) =>
                  onUpdateComp({
                    ...editingCompModal.comp,
                    component_type: e.target.value as
                      | "BASIC"
                      | "IMPROVEMENT",
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                  background: "#ffffff",
                }}
              >
                <option value="BASIC">Básico (incluido en tarifa)</option>
                <option value="IMPROVEMENT">
                  Mejora / Extra (con incremento)
                </option>
              </select>
            </div>

            <div>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#334155",
                  display: "block",
                  marginBottom: "4px",
                }}
              >
                Cantidad o Fórmula
              </label>
              <input
                type="text"
                value={editingCompModal.comp.quantity_expression || "1"}
                onChange={(e) =>
                  onUpdateComp({
                    ...editingCompModal.comp,
                    quantity_expression: e.target.value,
                  })
                }
                placeholder="1, 2 o fórmula ej. MOTORIZACION"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  fontSize: "13px",
                }}
              />
            </div>
          </div>

          {/* Increments fields if Improvement */}
          {editingCompModal.comp.component_type === "IMPROVEMENT" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                padding: "12px",
                background: "#efe9df",
                border: "1px solid #fef3c7",
                borderRadius: "8px",
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#92400e",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Tipo de Incremento
                </label>
                <select
                  value={editingCompModal.comp.price_increment_type}
                  onChange={(e) =>
                    onUpdateComp({
                      ...editingCompModal.comp,
                      price_increment_type: e.target.value as
                        | "FIXED"
                        | "PERCENTAGE",
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #fde68a",
                    fontSize: "13px",
                    background: "#ffffff",
                  }}
                >
                  <option value="FIXED">Importe Fijo (€)</option>
                  <option value="PERCENTAGE">
                    Porcentaje sobre base (%)
                  </option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#92400e",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Valor del Incremento
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingCompModal.comp.price_increment}
                  onChange={(e) =>
                    onUpdateComp({
                      ...editingCompModal.comp,
                      price_increment: parseFloat(e.target.value) || 0,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #fde68a",
                    fontSize: "13px",
                  }}
                />
              </div>
            </div>
          )}

          {/* Cutting / Manufacturing Dimensions (Only if the article has dimensions) */}
          {comp.dimensions && comp.dimensions.length > 0 && (
            <div
              style={{
                marginTop: "14px",
                padding: "12px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#334155",
                  marginBottom: "6px",
                }}
              >
                <Ruler size={14} style={{ color: "var(--primary)" }} />
                <span>
                  Dimensiones y Fórmulas de Corte del Artículo ({comp.dimensions.length})
                </span>
              </div>
              <p
                style={{
                  fontSize: "11.5px",
                  color: "#64748b",
                  margin: "0 0 10px",
                }}
              >
                Indica la dimensión o fórmula de corte para cada medida requerida por este artículo (ej. <code>ANCHO</code>, <code>ALTO - 50</code>, o valor numérico).
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    comp.dimensions.length > 1 ? "1fr 1fr" : "1fr",
                  gap: "10px",
                }}
              >
                {comp.dimensions.map((d) => {
                  const dimUnitSymbol = d.unit_symbol || d.unit_code || "mm";
                  const isDifferent =
                    workUnitSymbol &&
                    dimUnitSymbol.toLowerCase() !==
                      workUnitSymbol.toLowerCase();

                  return (
                    <div
                      key={d.code}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      <FormulaPredictiveInput
                        label={`${d.name || d.code} (${dimUnitSymbol})`}
                        value={comp.dimension_expressions?.[d.code] ?? ""}
                        onChange={(val) =>
                          onUpdateComp({
                            ...comp,
                            dimension_expressions: {
                              ...comp.dimension_expressions,
                              [d.code]: val,
                            },
                          })
                        }
                        placeholder={`Ej. ${d.code} o ${d.code} - 50`}
                        availableInputs={selections}
                        availableVariables={variables}
                        compact
                      />
                      {isDifferent && (
                        <div
                          style={{
                            fontSize: "10px",
                            color: "#0284c7",
                            marginTop: "2px",
                          }}
                        >
                          Requerido en {dimUnitSymbol} (OTD en {workUnitSymbol}). Conversión automática.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions-footer">
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onSave}
            style={{ background: "var(--primary)", borderColor: "var(--primary)" }}
          >
            <CheckCircle2 size={15} /> Guardar Componente
          </button>
        </div>
      </div>
    </div>
  );
}
