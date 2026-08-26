import React, { useState } from "react";
import { CheckCircle2, Package, Search, X } from "lucide-react";
import {
  searchOninProducts,
  fetchProductForOtdComponent,
} from "../../../services/otd/otdCalculationService";
import type {
  Product,
  ProductCharacteristic,
} from "../../../services/catalog/productRepository";
import type { EditingCompModalState } from "./types";

export type OtdComponentEditModalProps = {
  editingCompModal: NonNullable<EditingCompModalState>;
  onClose: () => void;
  onSave: () => void;
  onUpdateComp: (comp: NonNullable<EditingCompModalState>["comp"]) => void;
};

export function OtdComponentEditModal({
  editingCompModal,
  onClose,
  onSave,
  onUpdateComp,
}: OtdComponentEditModalProps) {
  const [productSearch, setProductSearch] = useState("");
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [compFeedback, setCompFeedback] = useState<string>("");

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
    try {
      const loaded = await fetchProductForOtdComponent(prod.id);
      onUpdateComp({
        ...editingCompModal.comp,
        product_id: prod.id,
        code: prod.code,
        description: prod.commercial_description || prod.technical_description || null,
        product: loaded.product,
        characteristics: loaded.characteristics,
        characteristic_id:
          loaded.characteristics.length > 0 ? loaded.characteristics[0].id : null,
      });
      setProductResults([]);
      setProductSearch("");
      setCompFeedback(`Artículo asignado: ${prod.code}`);
      setTimeout(() => setCompFeedback(""), 3000);
    } catch {
      onUpdateComp({
        ...editingCompModal.comp,
        product_id: prod.id,
        code: prod.code,
        description: prod.commercial_description || prod.technical_description || null,
      });
      setProductResults([]);
      setProductSearch("");
    }
  };

  return (
    <div
      className="otd-nested-modal-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div className="otd-nested-modal-box">
        <div className="otd-nested-modal-header">
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

        <div className="otd-nested-modal-body">
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
                      <div style={{ fontSize: "11.5px", color: "#64748b" }}>
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
              <code style={{ color: "#0369a1", fontWeight: 600 }}>
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
        </div>

        <div className="otd-nested-modal-footer">
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
            style={{ background: "#0284c7", borderColor: "#0284c7" }}
          >
            <CheckCircle2 size={15} /> Guardar Componente
          </button>
        </div>
      </div>
    </div>
  );
}
