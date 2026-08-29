import React, { useState } from "react";
import { Plus, Trash2, Search, X, Loader2 } from "lucide-react";
import { FormulaPredictiveInput } from "../FormulaPredictiveInput";
import {
  searchOninProducts,
  type OninProduct,
} from "../../../services/otd/otdCalculationService";
import type { Unit } from "../../../services/catalog/unitRepository";
import type { Component, Otd, Selection, Variable } from "./types";

export type OtdComponentsSectionProps = {
  components: Component[];
  products: Record<number, OninProduct>;
  otd: Otd;
  units: Unit[];
  selections: Selection[];
  variables: Variable[];
  onProductsUpdate: (newProducts: Record<number, OninProduct>) => void;
  onChange: (updated: Component[]) => void;
};

export function OtdComponentsSection({
  components,
  products,
  otd,
  units,
  selections,
  variables,
  onProductsUpdate,
  onChange,
}: OtdComponentsSectionProps) {
  // Product Picker state
  const [productSearch, setProductSearch] = useState("");
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);
  const [productResults, setProductResults] = useState<OninProduct[]>([]);
  const [activeProductComponent, setActiveProductComponent] = useState<
    number | null
  >(null);

  const emptyComponent = (): Component => ({
    product_id: null,
    characteristic_id: null,
    characteristic_expression: null,
    quantity_expression: "1",
    component_type: "BASIC",
    price_increment: 0,
    price_increment_type: "FIXED",
    unit_id: null,
    active: true,
    sort_order: components.length,
    dimension_expressions: {},
  });

  const addComponent = () => {
    onChange([...components, emptyComponent()]);
  };

  const removeComponent = (index: number) => {
    onChange(components.filter((_, i) => i !== index));
  };

  const updateComponent = (index: number, partial: Partial<Component>) => {
    const next = [...components];
    next[index] = { ...next[index], ...partial };
    onChange(next);
  };

  const searchProducts = async (term: string) => {
    setProductSearch(term);
    setIsSearchingProduct(true);
    try {
      const res = await searchOninProducts(term);
      setProductResults(res);
    } catch (e) {
      console.error("Error buscando productos:", e);
    } finally {
      setIsSearchingProduct(false);
    }
  };

  const selectProduct = (componentIdx: number, p: OninProduct) => {
    onProductsUpdate({ ...products, [p.id]: p });

    const initialDimExprs: Record<string, string> = {};
    if (p.measurement_type?.dimensions) {
      p.measurement_type.dimensions.forEach((d) => {
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

    updateComponent(componentIdx, {
      product_id: p.id,
      code: p.code,
      description: p.commercial_description || p.technical_description,
      dimension_expressions: initialDimExprs,
      characteristic_id: p.characteristics[0]?.id ?? null,
      characteristic_expression: null,
    });

    setActiveProductComponent(null);
    setProductResults([]);
    setProductSearch("");
  };

  const clearProduct = (componentIdx: number) => {
    updateComponent(componentIdx, {
      product_id: null,
      code: "",
      description: "",
      dimension_expressions: {},
      characteristic_id: null,
      characteristic_expression: null,
    });
  };

  return (
    <section id="sec-componentes" className="otd-card otd-section-anchor">
      <div className="otd-card-head">
        <div>
          <h2>5. Componentes del producto</h2>
          <p>
            Cada componente es un artículo real de ONIN. Si el OTD tiene
            escalado base, los componentes básicos no aumentan el precio salvo
            que se definan como Mejoras con incremento de precio.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={addComponent}
        >
          <Plus size={15} /> Añadir artículo
        </button>
      </div>

      {components.length === 0 ? (
        <div className="otd-empty">
          Todavía no hay artículos vinculados al OTD.
        </div>
      ) : (
        components.map((c, ci) => {
          const product = c.product_id ? products[c.product_id] : undefined;
          const dimensions = product?.measurement_type?.dimensions ?? [];
          const characteristics = product?.characteristics ?? [];
          const dynamic = Boolean(c.characteristic_expression?.trim());
          return (
            <div className="otd-row-card" key={c.id || ci}>
              <div className="otd-row-actions">
                <div className="row-tag">
                  <strong>
                    {ci + 1}. Componente:{" "}
                    {product?.commercial_description ||
                      product?.technical_description ||
                      product?.code ||
                      c.code ||
                      "Sin seleccionar"}
                  </strong>
                  <span
                    className={`comp-type-chip ${c.component_type === "IMPROVEMENT" ? "improvement" : "basic"}`}
                  >
                    {c.component_type === "IMPROVEMENT"
                      ? "Mejora con incremento"
                      : "Básico (incluido en base)"}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-btn danger"
                  title="Eliminar componente"
                  onClick={() => removeComponent(ci)}
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div
                className={`otd-component-grid ${c.component_type === "IMPROVEMENT" ? "has-improvement" : ""}`}
              >
                {/* Product Selector */}
                <div className="otd-product-field">
                  <span className="field-label">Artículo ONIN *</span>
                  {product ? (
                    <div className="otd-product-selected-input">
                      <input
                        type="text"
                        readOnly
                        value={product.code}
                        className="otd-product-code-field"
                        onClick={() => {
                          setActiveProductComponent(ci);
                          setProductSearch(product.code);
                          void searchProducts(product.code);
                        }}
                        title={`${product.code} - ${product.commercial_description || product.technical_description || ""}`}
                      />
                      <div className="prod-select-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Buscar o cambiar artículo"
                          onClick={() => {
                            setActiveProductComponent(ci);
                            setProductSearch(product.code);
                            void searchProducts(product.code);
                          }}
                        >
                          <Search size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Quitar artículo"
                          onClick={() => clearProduct(ci)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="product-select-empty"
                      onClick={() => {
                        setActiveProductComponent(ci);
                        setProductSearch("");
                        void searchProducts("");
                      }}
                    >
                      <Search size={15} /> Seleccionar artículo de ONIN
                    </button>
                  )}

                  {activeProductComponent === ci && (
                    <div className="otd-product-picker">
                      <div className="otd-product-search">
                        <Search size={15} />
                        <input
                          autoFocus
                          value={productSearch}
                          onChange={(e) => void searchProducts(e.target.value)}
                          placeholder="Buscar por código o descripción…"
                        />
                        {isSearchingProduct ? (
                          <Loader2
                            size={14}
                            className="animate-spin"
                            style={{ color: "#64748b" }}
                          />
                        ) : null}
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => {
                            setActiveProductComponent(null);
                            setProductResults([]);
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {isSearchingProduct && productResults.length === 0 ? (
                        <div
                          className="otd-product-no-results"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <Loader2 size={14} className="animate-spin" />{" "}
                          Buscando artículos en catálogo…
                        </div>
                      ) : productResults.length > 0 ? (
                        <div className="otd-product-results">
                          {productResults.map((p) => (
                            <button
                              type="button"
                              key={p.id}
                              onClick={() => selectProduct(ci, p)}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "baseline",
                                }}
                              >
                                <strong>{p.code}</strong>
                                {p.measurement_type && (
                                  <span
                                    style={{
                                      fontSize: "11px",
                                      color: "var(--primary, #0284c7)",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {p.measurement_type.name} (
                                    {p.measurement_type.dimensions?.length ??
                                      p.measurement_type.dimension_count}{" "}
                                    dim.)
                                  </span>
                                )}
                              </div>
                              <span>
                                {p.commercial_description ||
                                  p.technical_description ||
                                  "Sin descripción"}
                              </span>
                              {p.characteristics.length > 0 && (
                                <small>
                                  {p.characteristics.length}{" "}
                                  característica(s)/acabado(s) disponible(s)
                                </small>
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="otd-product-no-results">
                          No se han encontrado artículos con ese criterio.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Component Type */}
                <label>
                  <span className="field-label">Tipo de componente</span>
                  <select
                    value={c.component_type}
                    onChange={(e) =>
                      updateComponent(ci, {
                        component_type: e.target
                          .value as Component["component_type"],
                      })
                    }
                  >
                    <option value="BASIC">Básico (Incluido en base)</option>
                    <option value="IMPROVEMENT">
                      Mejora (Aplica incremento)
                    </option>
                  </select>
                </label>

                {/* Component Unit of Measure */}
                <label>
                  <span className="field-label">Unidad del componente</span>
                  <select
                    value={c.unit_id ?? ""}
                    onChange={(e) =>
                      updateComponent(ci, {
                        unit_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">
                      {product?.unit
                        ? `Catálogo: ${product.unit.name} (${product.unit.symbol || product.unit.code})`
                        : "Por defecto (ud)"}
                    </option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.symbol || u.code})
                      </option>
                    ))}
                  </select>
                </label>

                {/* Quantity / Formula with Predictive Autocomplete & Collapsible Assistant */}
                <div className="otd-quantity-formula-col">
                  <FormulaPredictiveInput
                    label="Cantidad / fórmula"
                    required
                    value={c.quantity_expression ?? ""}
                    onChange={(val) =>
                      updateComponent(ci, { quantity_expression: val })
                    }
                    placeholder="Ej. 1, ANCHO / 1000, CEIL(ANCHO / 1500) o SUPERFICIE"
                    availableInputs={selections}
                    availableVariables={variables}
                  />
                </div>

                {/* Improvement Pricing */}
                {c.component_type === "IMPROVEMENT" && (
                  <>
                    <label>
                      <span className="field-label">Tipo incremento</span>
                      <select
                        value={c.price_increment_type}
                        onChange={(e) =>
                          updateComponent(ci, {
                            price_increment_type: e.target
                              .value as Component["price_increment_type"],
                          })
                        }
                      >
                        <option value="FIXED">Importe fijo (€)</option>
                        <option value="PERCENTAGE">
                          Porcentaje sobre base (%)
                        </option>
                      </select>
                    </label>

                    <label>
                      <span className="field-label">Valor incremento</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={c.price_increment}
                        onChange={(e) =>
                          updateComponent(ci, {
                            price_increment: Number(e.target.value) || 0,
                          })
                        }
                        placeholder="0"
                      />
                    </label>
                  </>
                )}
              </div>

              {/* Characteristic / Color Section */}
              {product && characteristics.length > 0 && (
                <div className="otd-characteristic-block">
                  <div className="otd-dimensions-title">
                    <strong>
                      Característica / Acabado / Color del Componente
                    </strong>
                    <span>
                      Configura un acabado fijo del catálogo (
                      {characteristics.length} disponible
                      {characteristics.length > 1 ? "s" : ""}) o resuélvelo
                      dinámicamente con una variable/fórmula.
                    </span>
                  </div>
                  <div className="otd-characteristic-grid">
                    <label>
                      <span className="field-label">
                        Origen de la característica
                      </span>
                      <select
                        value={dynamic ? "VARIABLE" : "FIXED"}
                        onChange={(e) =>
                          e.target.value === "VARIABLE"
                            ? updateComponent(ci, {
                                characteristic_id: null,
                                characteristic_expression:
                                  c.characteristic_expression || "COLOR",
                              })
                            : updateComponent(ci, {
                                characteristic_expression: null,
                                characteristic_id:
                                  characteristics[0]?.id ?? null,
                              })
                        }
                      >
                        <option value="FIXED">
                          Fija de catálogo ({characteristics.length}{" "}
                          disponibles)
                        </option>
                        <option value="VARIABLE">
                          Fórmula o Variable dinámica
                        </option>
                      </select>
                    </label>

                    {dynamic ? (
                      <div className="otd-characteristic-expr-wrap">
                        <FormulaPredictiveInput
                          label="Fórmula / Variable característica"
                          value={c.characteristic_expression ?? ""}
                          onChange={(val) =>
                            updateComponent(ci, {
                              characteristic_expression: val,
                              characteristic_id: null,
                            })
                          }
                          placeholder="Ej. COLOR, LONA o TIPO_ACABADO"
                          availableInputs={selections}
                          availableVariables={variables}
                          compact
                        />
                      </div>
                    ) : (
                      <label>
                        <span className="field-label">
                          Característica del catálogo
                        </span>
                        <select
                          value={c.characteristic_id ?? ""}
                          onChange={(e) =>
                            updateComponent(ci, {
                              characteristic_id: e.target.value
                                ? Number(e.target.value)
                                : null,
                              characteristic_expression: null,
                            })
                          }
                        >
                          <option value="">
                            Seleccionar característica…
                          </option>
                          {characteristics.map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              {ch.code}
                              {ch.description ? ` · ${ch.description}` : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Dimensions Section (Formula / Quantity per dimension) */}
              {product && dimensions.length > 0 && (
                <div className="otd-dimensions-compact-block">
                  <div className="otd-dimensions-compact-grid">
                    {dimensions.map((d) => {
                      const dimUnitSymbol =
                        d.unit?.symbol || d.unit?.code || "mm";
                      const workUnitSymbol =
                        units.find((u) => u.id === otd.work_unit_id)?.symbol ||
                        units.find((u) => u.id === otd.work_unit_id)?.code ||
                        "mm";
                      const isDifferent =
                        dimUnitSymbol.toLowerCase() !==
                        workUnitSymbol.toLowerCase();

                      return (
                        <div
                          key={d.id || d.code}
                          className="otd-dimension-compact-item"
                        >
                          <FormulaPredictiveInput
                            label={`${d.name || d.code} (${dimUnitSymbol})`}
                            value={c.dimension_expressions?.[d.code] ?? ""}
                            onChange={(val) =>
                              updateComponent(ci, {
                                dimension_expressions: {
                                  ...c.dimension_expressions,
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
                                fontSize: 10,
                                color: "var(--primary, #0284c7)",
                                marginTop: 2,
                              }}
                            >
                              Requerido en {dimUnitSymbol} (OTD en{" "}
                              {workUnitSymbol}). Conversión automática.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
