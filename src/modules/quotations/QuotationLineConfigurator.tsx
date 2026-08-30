import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Info,
  Layers,
  Package,
  RefreshCw,
  Ruler,
  Scissors,
  Search,
  Sparkles,
  Warehouse,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  loadMasterProductConfiguration,
  type MasterProductConfiguration,
} from "../../services/catalog/productConfigurationService";
import {
  buildQuotationLineSnapshot,
  compareSnapshotWithMaster,
  type MasterComparisonResult,
  type QuotationLineSnapshot,
} from "../../services/sales/quotationLineCalculationService";
import type {
  QuotationLineCharacteristicDraft,
  QuotationLineDimensionDraft,
  QuotationLineDraft,
} from "../../services/sales/quotationCreationRepository";
import { formatEuro } from "../../services/catalog/productPricingService";
import "./quotation-configurator.css";

export type QuotationLineConfiguratorProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    snapshot: QuotationLineSnapshot,
    lineDraft: QuotationLineDraft,
  ) => void;
  initialProductId?: number | null;
  initialSnapshot?: QuotationLineSnapshot | null;
  initialQuantity?: number;
  initialDiscount?: number;
  taxPercent?: number;
  companyId: number;
  warehouseId?: number | null;
  productsList: Array<{
    id: number;
    code: string;
    label: string;
    price?: number;
  }>;
};

export function QuotationLineConfigurator({
  isOpen,
  onClose,
  onConfirm,
  initialProductId = null,
  initialSnapshot = null,
  initialQuantity = 1,
  initialDiscount = 0,
  taxPercent = 21,
  companyId,
  warehouseId = null,
  productsList,
}: QuotationLineConfiguratorProps) {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    initialProductId ?? initialSnapshot?.article.id ?? null,
  );

  const [internalProducts, setInternalProducts] = useState<
    Array<{ id: number; code: string; label: string; price?: number }>
  >([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);

  const [masterConfig, setMasterConfig] =
    useState<MasterProductConfiguration | null>(null);
  const [loadingMaster, setLoadingMaster] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>("");

  // Form State
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(
    initialSnapshot?.selected_variant?.id ?? null,
  );
  const [attributeDrafts, setAttributeDrafts] = useState<
    QuotationLineCharacteristicDraft[]
  >([]);
  const [dimensionValues, setDimensionValues] = useState<
    Record<string, number | null>
  >({});
  const [quantity, setQuantity] = useState<number>(initialQuantity);
  const [discountPercent, setDiscountPercent] =
    useState<number>(initialDiscount);
  const [customNotes, setCustomNotes] = useState<string>(
    initialSnapshot?.notes ?? "",
  );

  // Snapshot and Master Comparison
  const [previewSnapshot, setPreviewSnapshot] =
    useState<QuotationLineSnapshot | null>(initialSnapshot ?? null);
  const [masterComparison, setMasterComparison] =
    useState<MasterComparisonResult>({
      hasChanged: false,
      differences: [],
    });
  const [calculating, setCalculating] = useState<boolean>(false);

  // Sub tab for Step 5 (Despiece, Cortes, Stock)
  const [subTab, setSubTab] = useState<"bom" | "cuts" | "stock">("bom");

  // Search filter for Step 1
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Sync state when modal is opened with new props
  useEffect(() => {
    if (!isOpen) return;
    const targetId = initialProductId ?? initialSnapshot?.article.id ?? null;
    setSelectedProductId(targetId);
    setQuantity(initialQuantity);
    setDiscountPercent(initialDiscount);
    setCustomNotes(initialSnapshot?.notes ?? "");
    if (initialSnapshot?.selected_variant?.id) {
      setSelectedVariantId(initialSnapshot.selected_variant.id);
    }
    // If opened for an existing article, directly show Step 2 (Characteristics & Dimensions)
    if (targetId) {
      setActiveStep(2);
    } else {
      setActiveStep(1);
    }
  }, [
    isOpen,
    initialProductId,
    initialSnapshot,
    initialQuantity,
    initialDiscount,
  ]);

  // Fallback: Fetch products if productsList is empty or not passed
  useEffect(() => {
    if (!isOpen) return;
    if (productsList && productsList.length > 0) {
      setInternalProducts(productsList);
      return;
    }

    let active = true;
    setLoadingProducts(true);

    (async () => {
      try {
        if (!supabase) return;
        const { data, error } = await supabase
          .from("product")
          .select(
            "id,code,commercial_description,technical_description,sales_price",
          )
          .eq("active", true)
          .is("deleted_at", null)
          .order("code");

        if (error) throw error;
        if (active && data) {
          setInternalProducts(
            data.map((p: any) => ({
              id: Number(p.id),
              code: String(p.code || ""),
              label:
                p.commercial_description ||
                p.technical_description ||
                p.code ||
                "Sin descripción",
              price: Number(p.sales_price || 0),
            })),
          );
        }
      } catch (err) {
        console.warn("Error cargando artículos de respaldo:", err);
      } finally {
        if (active) setLoadingProducts(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isOpen, productsList]);

  // 1. Load Master Configuration whenever selectedProductId changes
  useEffect(() => {
    if (!isOpen || !selectedProductId) {
      setMasterConfig(null);
      return;
    }

    let active = true;
    setLoadingMaster(true);
    setLoadError("");

    loadMasterProductConfiguration(selectedProductId, companyId)
      .then((config) => {
        if (!active) return;
        setMasterConfig(config);

        // If not initialized from snapshot, setup default attribute drafts and dimensions
        if (
          !initialSnapshot ||
          initialSnapshot.article.id !== selectedProductId
        ) {
          const initAttrs: QuotationLineCharacteristicDraft[] =
            config.attributes.map((a) => ({
              attribute_id: a.attribute_id,
              attribute_value_id: a.values[0]?.id ?? null,
              value_text: null,
              value_number: null,
              value_boolean: null,
            }));
          setAttributeDrafts(initAttrs);

          const initDims: Record<string, number | null> = {};
          config.dimensions.forEach((d) => {
            initDims[d.code] = 1;
          });
          setDimensionValues(initDims);

          if (config.characteristics.length > 0) {
            setSelectedVariantId(config.characteristics[0].id);
          }
        } else {
          // Hydrate from existing snapshot
          const hydratedAttrs: QuotationLineCharacteristicDraft[] = (
            initialSnapshot.selected_attributes || []
          ).map((a) => ({
            attribute_id: a.attribute_id,
            attribute_value_id: a.value_id,
            value_text: a.value_text ?? null,
            value_number: a.value_number ?? null,
            value_boolean: a.value_boolean ?? null,
          }));
          setAttributeDrafts(hydratedAttrs);

          const hydratedDims: Record<string, number | null> = {};
          (initialSnapshot.dimensions || []).forEach((d) => {
            hydratedDims[d.code] = d.value;
          });
          setDimensionValues(hydratedDims);

          setSelectedVariantId(initialSnapshot.selected_variant?.id ?? null);
          setQuantity(initialSnapshot.quantity);
          setDiscountPercent(initialSnapshot.pricing.discount_percent);

          // Compare with master to alert if changed
          const comparison = compareSnapshotWithMaster(initialSnapshot, config);
          setMasterComparison(comparison);
        }
      })
      .catch((err) => {
        if (active)
          setLoadError(
            err instanceof Error ? err.message : "Error al cargar artículo",
          );
      })
      .finally(() => {
        if (active) setLoadingMaster(false);
      });

    return () => {
      active = false;
    };
  }, [selectedProductId, companyId, isOpen]);

  // 2. Recalculate Preview Snapshot on any configuration parameter change
  useEffect(() => {
    if (!masterConfig) return;

    let active = true;
    setCalculating(true);

    buildQuotationLineSnapshot({
      masterConfig,
      selectedVariantId,
      selectedAttributes: attributeDrafts,
      dimensionValues,
      quantity,
      discountPercent,
      taxPercent,
      companyId,
      warehouseId,
      customNotes,
    })
      .then((snapshot) => {
        if (active) setPreviewSnapshot(snapshot);
      })
      .catch((err) => {
        console.warn("Error recalculating snapshot:", err);
      })
      .finally(() => {
        if (active) setCalculating(false);
      });

    return () => {
      active = false;
    };
  }, [
    masterConfig,
    selectedVariantId,
    attributeDrafts,
    dimensionValues,
    quantity,
    discountPercent,
    taxPercent,
    companyId,
    warehouseId,
    customNotes,
  ]);

  if (!isOpen) return null;

  const availableProducts =
    productsList && productsList.length > 0 ? productsList : internalProducts;

  // Filtered Products for Step 1
  const filteredProducts = availableProducts.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return `${p.code} ${p.label}`.toLowerCase().includes(q);
  });

  const selectedProductInfo = availableProducts.find(
    (p) => p.id === selectedProductId,
  );

  const handleUpdateToMaster = () => {
    setMasterComparison({ hasChanged: false, differences: [] });
  };

  const handleConfirm = () => {
    if (!previewSnapshot) return;

    const lineDimensions: QuotationLineDimensionDraft[] =
      previewSnapshot.dimensions.map((d) => ({
        code: d.code,
        name: d.name,
        value: d.value,
        unit_id: d.unit_id,
        sort_order: d.dimension_number,
      }));

    const lineCharacteristics: QuotationLineCharacteristicDraft[] =
      previewSnapshot.selected_attributes.map((a) => ({
        attribute_id: a.attribute_id,
        attribute_value_id: a.value_id,
        value_text: a.value_text ?? null,
        value_number: a.value_number ?? null,
        value_boolean: a.value_boolean ?? null,
      }));

    const lineDraft: QuotationLineDraft = {
      product_id: previewSnapshot.article.id,
      description:
        previewSnapshot.article.commercial_description ||
        previewSnapshot.article.technical_description ||
        previewSnapshot.article.code,
      quantity: previewSnapshot.quantity,
      unit_price: previewSnapshot.pricing.unit_price,
      discount_percent: previewSnapshot.pricing.discount_percent,
      tax_rate_id: null,
      tax_percent: taxPercent,
      dimensions: lineDimensions,
      characteristics: lineCharacteristics,
      specific_data: {
        configuration_snapshot: previewSnapshot,
      },
    };

    onConfirm(previewSnapshot, lineDraft);
    onClose();
  };

  return (
    <div className="configurator-overlay" role="dialog" aria-modal="true">
      <div className="configurator-modal">
        {/* Header */}
        <div className="configurator-header">
          <div className="configurator-header-info">
            <span className="configurator-eyebrow">
              Configurador de Línea de Presupuesto
            </span>
            <h2>
              {initialSnapshot
                ? `Editar configuración: ${previewSnapshot?.article.code || "Artículo"}`
                : "Nueva línea configurada"}
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

        {/* Master Change Alert Banner (if article changed in catalog since line creation) */}
        {masterComparison.hasChanged && (
          <div className="master-change-alert">
            <div className="master-change-alert-head">
              <AlertTriangle size={18} />
              <span>
                El artículo maestro ha sido modificado desde la creación de esta
                línea.
              </span>
            </div>
            <div className="master-change-diff-list">
              {masterComparison.differences.map((diff, idx) => (
                <div key={idx} className="master-change-diff-item">
                  <strong>{diff.label}:</strong>
                  <span>
                    Original en presupuesto: <em>{diff.snapshotValue}</em> →
                    Catálogo maestro: <strong>{diff.masterValue}</strong>
                  </span>
                </div>
              ))}
            </div>
            <div className="master-change-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setMasterComparison({ hasChanged: false, differences: [] })
                }
              >
                Mantener configuración original de la línea
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleUpdateToMaster}
              >
                <RefreshCw size={14} />
                Actualizar a configuración actual del maestro
              </button>
            </div>
          </div>
        )}

        {/* Steps Navigation Bar */}
        <nav
          className="configurator-steps-nav"
          aria-label="Pasos de configuración"
        >
          <button
            type="button"
            className={`configurator-step-tab ${activeStep === 1 ? "active" : ""} ${
              selectedProductId ? "completed" : ""
            }`}
            onClick={() => setActiveStep(1)}
          >
            <span className="configurator-step-num">1</span>
            Artículo
          </button>
          <button
            type="button"
            className={`configurator-step-tab ${activeStep === 2 ? "active" : ""} ${
              activeStep > 2 ? "completed" : ""
            }`}
            onClick={() => selectedProductId && setActiveStep(2)}
            disabled={!selectedProductId}
          >
            <span className="configurator-step-num">2</span>
            Características
          </button>
          <button
            type="button"
            className={`configurator-step-tab ${activeStep === 3 ? "active" : ""} ${
              activeStep > 3 ? "completed" : ""
            }`}
            onClick={() => selectedProductId && setActiveStep(3)}
            disabled={!selectedProductId}
          >
            <span className="configurator-step-num">3</span>
            Medidas y Cantidad
          </button>
          <button
            type="button"
            className={`configurator-step-tab ${activeStep === 4 ? "active" : ""} ${
              activeStep > 4 ? "completed" : ""
            }`}
            onClick={() => selectedProductId && setActiveStep(4)}
            disabled={!selectedProductId}
          >
            <span className="configurator-step-num">4</span>
            Precio y Desglose
          </button>
          <button
            type="button"
            className={`configurator-step-tab ${activeStep === 5 ? "active" : ""} ${
              activeStep > 5 ? "completed" : ""
            }`}
            onClick={() => selectedProductId && setActiveStep(5)}
            disabled={!selectedProductId}
          >
            <span className="configurator-step-num">5</span>
            Despiece, Cortes y Stock
          </button>
          <button
            type="button"
            className={`configurator-step-tab ${activeStep === 6 ? "active" : ""}`}
            onClick={() => selectedProductId && setActiveStep(6)}
            disabled={!selectedProductId}
          >
            <span className="configurator-step-num">6</span>
            Resumen
          </button>
        </nav>

        {/* Modal Body */}
        <div className="configurator-body">
          {/* STEP 1: Article Selection (Always visible on step 1) */}
          {activeStep === 1 && (
            <div className="configurator-card">
              <div className="configurator-card-title">
                <h3>Paso 1: Selección de Artículo Maestro</h3>
                <span>
                  Selecciona el producto del catálogo para configurar la línea
                </span>
              </div>

              <div className="config-form-group">
                <label>Buscar artículo por código o descripción</label>
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
                      color: "#94a3b8",
                      pointerEvents: "none",
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Escribe para filtrar (ej. TOLDO, PERFIL, TEJIDO)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      paddingLeft: "36px",
                      paddingRight: searchQuery ? "36px" : "12px",
                    }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      style={{
                        position: "absolute",
                        right: "10px",
                        background: "transparent",
                        border: "none",
                        color: "#94a3b8",
                        cursor: "pointer",
                        display: "flex",
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#64748b",
                    marginTop: "4px",
                  }}
                >
                  Mostrando {filteredProducts.length} de{" "}
                  {availableProducts.length} artículo(s)
                </div>
              </div>

              {loadingProducts ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "30px",
                    color: "#64748b",
                  }}
                >
                  <RefreshCw
                    size={20}
                    className="spin"
                    style={{ margin: "0 auto 8px" }}
                  />
                  <div>Cargando catálogo de artículos…</div>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "30px",
                    color: "#64748b",
                    background: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px dashed #cbd5e1",
                  }}
                >
                  {searchQuery
                    ? "No se encontraron artículos que coincidan con la búsqueda."
                    : "No hay artículos disponibles en el catálogo."}
                </div>
              ) : (
                <div
                  style={{
                    maxHeight: "280px",
                    overflowY: "auto",
                    border: "1px solid #e4e2dc",
                    borderRadius: "8px",
                  }}
                >
                  <table className="config-data-table">
                    <thead>
                      <tr>
                        <th style={{ width: "140px" }}>Código</th>
                        <th>Descripción</th>
                        <th style={{ width: "110px", textAlign: "right" }}>
                          PVP Base
                        </th>
                        <th style={{ width: "120px", textAlign: "center" }}>
                          Acción
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((p) => {
                        const isSelected = p.id === selectedProductId;
                        return (
                          <tr
                            key={p.id}
                            style={{
                              background: isSelected ? "#e7ede9" : undefined,
                              cursor: "pointer",
                            }}
                            onClick={() => setSelectedProductId(p.id)}
                          >
                            <td>
                              <strong
                                style={{
                                  color: isSelected ? "#0284c7" : "#0f172a",
                                }}
                              >
                                {p.code}
                              </strong>
                            </td>
                            <td>{p.label}</td>
                            <td style={{ textAlign: "right", fontWeight: 500 }}>
                              {formatEuro(p.price ?? 0)}
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                className={
                                  isSelected
                                    ? "primary-button"
                                    : "secondary-button"
                                }
                                style={{
                                  height: "30px",
                                  padding: "0 12px",
                                  fontSize: "12px",
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProductId(p.id);
                                  setActiveStep(2);
                                }}
                              >
                                {isSelected ? "Configurar >" : "Seleccionar"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Status or Configuration Summary for Selected Product */}
              {selectedProductId && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "14px",
                    background: "#f8fafc",
                    borderRadius: "8px",
                    border: "1px solid #e4e2dc",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "10px",
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: "14px", color: "#0f172a" }}>
                        Artículo seleccionado:{" "}
                        {selectedProductInfo
                          ? `${selectedProductInfo.code} · ${selectedProductInfo.label}`
                          : selectedProductId}
                      </strong>
                    </div>

                    <button
                      type="button"
                      className="primary-button"
                      style={{
                        height: "34px",
                        padding: "0 16px",
                        fontSize: "13px",
                      }}
                      disabled={loadingMaster}
                      onClick={() => setActiveStep(2)}
                    >
                      Continuar a Características y Medidas
                      <ChevronRight size={16} />
                    </button>
                  </div>

                  {loadingMaster && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginTop: "10px",
                        color: "#0284c7",
                        fontSize: "13px",
                      }}
                    >
                      <RefreshCw size={15} className="spin" />
                      <span>Cargando configuración maestra del artículo…</span>
                    </div>
                  )}

                  {loadError && (
                    <div
                      style={{
                        color: "#b91c1c",
                        background: "#fee2e2",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        marginTop: "10px",
                        fontSize: "13px",
                      }}
                    >
                      {loadError}
                    </div>
                  )}

                  {masterConfig && (
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginTop: "10px",
                      }}
                    >
                      <span className="tag-badge info">
                        Familia: {masterConfig.family?.name || "General"}
                      </span>
                      {masterConfig.product.scaled && (
                        <span className="tag-badge warning">
                          Escalado por Medidas
                        </span>
                      )}
                      {masterConfig.product.scaled_by_characteristic && (
                        <span className="tag-badge warning">
                          Escalado por Variante
                        </span>
                      )}
                      <span className="tag-badge success">
                        {masterConfig.dimensions.length} dimensión(es)
                      </span>
                      <span className="tag-badge info">
                        {masterConfig.attributes.length} atributo(s)
                      </span>
                      <span className="tag-badge info">
                        {masterConfig.bomComponents.length} componente(s)
                        despiece
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEPS 2 to 6 */}
          {activeStep > 1 && (
            <>
              {loadingMaster && (
                <div
                  style={{
                    textAlign: "center",
                    padding: "50px 20px",
                    color: "#64748b",
                  }}
                >
                  <RefreshCw
                    size={28}
                    className="spin"
                    style={{ margin: "0 auto 12px", color: "#0284c7" }}
                  />
                  <div style={{ fontSize: "15px", fontWeight: 500 }}>
                    Cargando configuración maestra del artículo…
                  </div>
                  <div style={{ fontSize: "13px", marginTop: "4px" }}>
                    Recuperando atributos, dimensiones, variantes y despiece
                  </div>
                </div>
              )}

              {loadError && (
                <div
                  style={{
                    color: "#b91c1c",
                    background: "#fee2e2",
                    padding: "16px",
                    borderRadius: "8px",
                    border: "1px solid #fecaca",
                    margin: "20px 0",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                    Error al cargar la configuración del artículo
                  </div>
                  <p style={{ margin: "0 0 12px 0" }}>{loadError}</p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      if (selectedProductId) {
                        setLoadingMaster(true);
                        setLoadError("");
                        loadMasterProductConfiguration(
                          selectedProductId,
                          companyId,
                        )
                          .then(setMasterConfig)
                          .catch((e) =>
                            setLoadError(
                              e instanceof Error ? e.message : "Error",
                            ),
                          )
                          .finally(() => setLoadingMaster(false));
                      }
                    }}
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {!loadingMaster && masterConfig && (
                <>
                  {/* STEP 2: Configurable Characteristics & Variants */}
                  {activeStep === 2 && (
                    <div className="configurator-card">
                      <div className="configurator-card-title">
                        <h3>Paso 2: Características y Variantes</h3>
                        <span>
                          Personaliza atributos y variantes del artículo
                        </span>
                      </div>

                      {/* Variants (product_characteristic) */}
                      {masterConfig.characteristics.length > 0 && (
                        <div className="config-form-group">
                          <label>
                            Variante del producto
                            <span
                              style={{ color: "#0284c7", fontSize: "11px" }}
                            >
                              (Determina PVP, incrementos y escalado
                              condicionado)
                            </span>
                          </label>
                          <select
                            value={selectedVariantId ?? ""}
                            onChange={(e) =>
                              setSelectedVariantId(
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          >
                            <option value="">Selecciona variante…</option>
                            {masterConfig.characteristics.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.code} · {c.description || c.code}
                                {c.pvp
                                  ? ` (PVP: ${formatEuro(Number(c.pvp))})`
                                  : ""}
                                {c.price_increment
                                  ? ` (+${formatEuro(Number(c.price_increment))})`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Attributes */}
                      {masterConfig.attributes.length > 0 ? (
                        <div className="config-form-grid">
                          {masterConfig.attributes.map((attr) => {
                            const currentDraft = attributeDrafts.find(
                              (a) => a.attribute_id === attr.attribute_id,
                            );

                            return (
                              <div
                                key={attr.assignment_id}
                                className="config-form-group"
                              >
                                <label>
                                  {attr.name || attr.code}
                                  {attr.required && (
                                    <span
                                      style={{
                                        color: "#c4897a",
                                        fontSize: "11px",
                                      }}
                                    >
                                      * Obligatorio
                                    </span>
                                  )}
                                </label>
                                {attr.values.length > 0 ? (
                                  <select
                                    value={
                                      currentDraft?.attribute_value_id ?? ""
                                    }
                                    onChange={(e) => {
                                      const valId = e.target.value
                                        ? Number(e.target.value)
                                        : null;
                                      setAttributeDrafts((prev) =>
                                        prev.map((a) =>
                                          a.attribute_id === attr.attribute_id
                                            ? {
                                                ...a,
                                                attribute_value_id: valId,
                                              }
                                            : a,
                                        ),
                                      );
                                    }}
                                  >
                                    <option value="">Selecciona valor…</option>
                                    {attr.values.map((v) => (
                                      <option key={v.id} value={v.id}>
                                        {v.name || v.code}
                                      </option>
                                    ))}
                                  </select>
                                ) : attr.data_type === "NUMBER" ? (
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={currentDraft?.value_number ?? ""}
                                    onChange={(e) => {
                                      const n =
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value);
                                      setAttributeDrafts((prev) =>
                                        prev.map((a) =>
                                          a.attribute_id === attr.attribute_id
                                            ? { ...a, value_number: n }
                                            : a,
                                        ),
                                      );
                                    }}
                                  />
                                ) : attr.data_type === "BOOLEAN" ? (
                                  <label
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={
                                        currentDraft?.value_boolean === true
                                      }
                                      onChange={(e) => {
                                        const b = e.target.checked;
                                        setAttributeDrafts((prev) =>
                                          prev.map((a) =>
                                            a.attribute_id === attr.attribute_id
                                              ? { ...a, value_boolean: b }
                                              : a,
                                          ),
                                        );
                                      }}
                                    />
                                    <span>Activar opción</span>
                                  </label>
                                ) : (
                                  <input
                                    type="text"
                                    value={currentDraft?.value_text ?? ""}
                                    onChange={(e) => {
                                      const txt = e.target.value || null;
                                      setAttributeDrafts((prev) =>
                                        prev.map((a) =>
                                          a.attribute_id === attr.attribute_id
                                            ? { ...a, value_text: txt }
                                            : a,
                                        ),
                                      );
                                    }}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        masterConfig.characteristics.length === 0 && (
                          <p style={{ color: "#64748b", fontSize: "13px" }}>
                            Este artículo no tiene características ni variantes
                            configurables definidas en el maestro.
                          </p>
                        )
                      )}
                    </div>
                  )}

                  {/* STEP 3: Measures & Quantity */}
                  {activeStep === 3 && (
                    <div className="configurator-card">
                      <div className="configurator-card-title">
                        <h3>Paso 3: Medidas y Cantidad</h3>
                        <span>
                          {masterConfig.measurementType
                            ? `Tipo de medida: ${masterConfig.measurementType.name} (${masterConfig.dimensions.length} dimensiones)`
                            : "Introduce la cantidad y dimensiones requeridas"}
                        </span>
                      </div>

                      {masterConfig.dimensions.length > 0 && (
                        <div className="config-form-grid">
                          {masterConfig.dimensions.map((dim, idx) => {
                            const val = dimensionValues[dim.code] ?? "";
                            const stepVal =
                              1 / Math.pow(10, Math.max(0, dim.decimals ?? 2));
                            const unitObj = dim.unit_id
                              ? masterConfig.unitsMap.get(dim.unit_id)
                              : null;

                            return (
                              <div
                                key={dim.id || idx}
                                className="config-form-group"
                              >
                                <label>
                                  {dim.name || dim.code}
                                  {unitObj && (
                                    <span
                                      style={{
                                        color: "#64748b",
                                        fontSize: "11px",
                                      }}
                                    >
                                      ({unitObj.code || unitObj.name})
                                    </span>
                                  )}
                                </label>
                                <input
                                  type="number"
                                  step={stepVal}
                                  min="0"
                                  value={val}
                                  placeholder="0.00"
                                  onChange={(e) => {
                                    const n =
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value);
                                    setDimensionValues((prev) => ({
                                      ...prev,
                                      [dim.code]: n,
                                    }));
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div
                        className="config-form-grid"
                        style={{ marginTop: "10px" }}
                      >
                        <div className="config-form-group">
                          <label>
                            Cantidad de la línea (
                            {masterConfig.baseUnit?.code || "ud"})
                          </label>
                          <input
                            type="number"
                            min="0.01"
                            step="1"
                            value={quantity}
                            onChange={(e) =>
                              setQuantity(
                                Math.max(0.01, Number(e.target.value)),
                              )
                            }
                          />
                        </div>
                        <div className="config-form-group">
                          <label>Descuento comercial (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={discountPercent}
                            onChange={(e) =>
                              setDiscountPercent(Number(e.target.value))
                            }
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* STEP 4: Pricing & Explainable Breakdown */}
                  {activeStep === 4 && previewSnapshot && (
                    <div className="pricing-breakdown-card">
                      <div className="configurator-card-title">
                        <h3>Paso 4: Desglose Explicable de Precio</h3>
                        <span>
                          Calculado automáticamente por el motor de precios
                        </span>
                      </div>

                      <table className="pricing-steps-table">
                        <tbody>
                          {previewSnapshot.pricing.explainable_steps.map(
                            (step, idx) => (
                              <tr
                                key={idx}
                                className={
                                  step.highlight ? "highlight-row" : undefined
                                }
                              >
                                <td>
                                  {step.label}
                                  {step.badge && (
                                    <span className="pricing-badge">
                                      {step.badge}
                                    </span>
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
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* STEP 5: Despiece (BOM), Cortes & Stock Availability */}
                  {activeStep === 5 && previewSnapshot && (
                    <div className="configurator-card">
                      <div className="configurator-card-title">
                        <h3>Paso 5: Despiece, Cortes y Stock</h3>
                        <span>
                          Evaluación técnica de componentes, patrones de corte y
                          disponibilidad
                        </span>
                      </div>

                      <div className="sub-tabs-bar">
                        <button
                          type="button"
                          className={`sub-tab-btn ${subTab === "bom" ? "active" : ""}`}
                          onClick={() => setSubTab("bom")}
                        >
                          <Layers
                            size={14}
                            style={{ display: "inline", marginRight: "6px" }}
                          />
                          Despiece (
                          {previewSnapshot.breakdown.components.length})
                        </button>
                        <button
                          type="button"
                          className={`sub-tab-btn ${subTab === "cuts" ? "active" : ""}`}
                          onClick={() => setSubTab("cuts")}
                        >
                          <Scissors
                            size={14}
                            style={{ display: "inline", marginRight: "6px" }}
                          />
                          Cortes y Mermas (
                          {previewSnapshot.cuts.canvas_cuts.length +
                            previewSnapshot.cuts.profile_cuts.length}
                          )
                        </button>
                        <button
                          type="button"
                          className={`sub-tab-btn ${subTab === "stock" ? "active" : ""}`}
                          onClick={() => setSubTab("stock")}
                        >
                          <Warehouse
                            size={14}
                            style={{ display: "inline", marginRight: "6px" }}
                          />
                          Disponibilidad Almacén
                        </button>
                      </div>

                      {/* Sub tab 1: BOM */}
                      {subTab === "bom" && (
                        <div>
                          {previewSnapshot.breakdown.components.length > 0 ? (
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
                                {previewSnapshot.breakdown.components.map(
                                  (comp) => (
                                    <tr key={comp.id}>
                                      <td>
                                        <strong>{comp.code}</strong>
                                        <div
                                          style={{
                                            fontSize: "11px",
                                            color: "#64748b",
                                          }}
                                        >
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
                                            : "Incluido en base"}
                                        </strong>
                                      </td>
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </table>
                          ) : (
                            <p style={{ color: "#64748b", fontSize: "13px" }}>
                              Este artículo no tiene despiece asignado en el
                              catálogo maestro.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Sub tab 2: Cuts */}
                      {subTab === "cuts" && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "16px",
                          }}
                        >
                          {/* Canvas Cuts */}
                          {previewSnapshot.cuts.canvas_cuts.length > 0 && (
                            <div>
                              <h4
                                style={{
                                  margin: "0 0 8px 0",
                                  fontSize: "13px",
                                  color: "#0f172a",
                                }}
                              >
                                Patrón de Corte de Tejido / Lona
                              </h4>
                              <table className="config-data-table">
                                <thead>
                                  <tr>
                                    <th>Pieza</th>
                                    <th>Color</th>
                                    <th>Medida Nominal</th>
                                    <th>Medida con Márgenes</th>
                                    <th>Paños</th>
                                    <th>Superficie Total</th>
                                    <th>Notas Confección</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewSnapshot.cuts.canvas_cuts.map((c) => (
                                    <tr key={c.id}>
                                      <td>
                                        <strong>{c.name}</strong>
                                      </td>
                                      <td>{c.fabric_color}</td>
                                      <td>
                                        {c.nominal_width} m × {c.nominal_height}{" "}
                                        m
                                      </td>
                                      <td>
                                        <strong>
                                          {c.cut_width} m × {c.cut_height} m
                                        </strong>
                                      </td>
                                      <td>{c.cloth_strips_count}</td>
                                      <td>{c.total_area_m2} m²</td>
                                      <td
                                        style={{
                                          fontSize: "11px",
                                          color: "#64748b",
                                        }}
                                      >
                                        {c.confection_notes}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Profile Cuts */}
                          {previewSnapshot.cuts.profile_cuts.length > 0 && (
                            <div>
                              <h4
                                style={{
                                  margin: "0 0 8px 0",
                                  fontSize: "13px",
                                  color: "#0f172a",
                                }}
                              >
                                Cortes de Perfiles y Barras
                              </h4>
                              <table className="config-data-table">
                                <thead>
                                  <tr>
                                    <th>Perfil</th>
                                    <th>Longitud de Corte</th>
                                    <th>Piezas</th>
                                    <th>Barras Estándar</th>
                                    <th>Merma / Resto</th>
                                    <th>Aprovechable</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewSnapshot.cuts.profile_cuts.map(
                                    (p) => (
                                      <tr key={p.id}>
                                        <td>
                                          <strong>{p.profile_code}</strong> ·{" "}
                                          {p.profile_name}
                                        </td>
                                        <td>
                                          <strong>
                                            {p.cut_length} {p.unit}
                                          </strong>
                                        </td>
                                        <td>{p.quantity_pieces}</td>
                                        <td>
                                          {p.bars_required} (
                                          {p.standard_bar_length / 1000} m)
                                        </td>
                                        <td>
                                          {p.waste_scrap_total}{" "}
                                          {p.unit || "mm"}
                                        </td>
                                        <td>
                                          {p.is_reusable_remainder ? (
                                            <span className="tag-badge success">
                                              Sí (≥ resto mín)
                                            </span>
                                          ) : (
                                            <span className="tag-badge warning">
                                              Descarte / Merma
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ),
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {!previewSnapshot.cuts.canvas_cuts.length &&
                            !previewSnapshot.cuts.profile_cuts.length && (
                              <p style={{ color: "#64748b", fontSize: "13px" }}>
                                No hay cálculos de corte aplicables para esta
                                configuración de producto.
                              </p>
                            )}
                        </div>
                      )}

                      {/* Sub tab 3: Stock Availability */}
                      {subTab === "stock" && (
                        <div>
                          {previewSnapshot.stock_preview ? (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "12px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <div>
                                  <strong>Almacén:</strong>{" "}
                                  {previewSnapshot.stock_preview.warehouseName}
                                </div>
                                <span
                                  className={`tag-badge ${
                                    previewSnapshot.stock_preview
                                      .overallStatus === "available"
                                      ? "success"
                                      : previewSnapshot.stock_preview
                                            .overallStatus === "low_stock"
                                        ? "warning"
                                        : "danger"
                                  }`}
                                >
                                  {previewSnapshot.stock_preview
                                    .overallStatus === "available"
                                    ? "Stock Disponible"
                                    : previewSnapshot.stock_preview
                                          .overallStatus === "low_stock"
                                      ? "Stock Bajo"
                                      : "Sin Stock Suficiente"}
                                </span>
                              </div>

                              <table className="config-data-table">
                                <thead>
                                  <tr>
                                    <th>Artículo / Componente</th>
                                    <th>Cantidad Necesaria</th>
                                    <th>En Stock</th>
                                    <th>Reservado</th>
                                    <th>Disponible</th>
                                    <th>Estado</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td>
                                      <strong>
                                        {
                                          previewSnapshot.stock_preview
                                            .mainProduct.productCode
                                        }
                                      </strong>
                                      <div
                                        style={{
                                          fontSize: "11px",
                                          color: "#64748b",
                                        }}
                                      >
                                        {
                                          previewSnapshot.stock_preview
                                            .mainProduct.productName
                                        }
                                      </div>
                                    </td>
                                    <td>
                                      {
                                        previewSnapshot.stock_preview
                                          .mainProduct.requiredQuantity
                                      }
                                    </td>
                                    <td>
                                      {
                                        previewSnapshot.stock_preview
                                          .mainProduct.inStock
                                      }
                                    </td>
                                    <td>
                                      {
                                        previewSnapshot.stock_preview
                                          .mainProduct.reserved
                                      }
                                    </td>
                                    <td>
                                      <strong>
                                        {
                                          previewSnapshot.stock_preview
                                            .mainProduct.available
                                        }
                                      </strong>
                                    </td>
                                    <td>
                                      <span
                                        className={`tag-badge ${
                                          previewSnapshot.stock_preview
                                            .mainProduct.hasSufficientStock
                                            ? "success"
                                            : "danger"
                                        }`}
                                      >
                                        {previewSnapshot.stock_preview
                                          .mainProduct.hasSufficientStock
                                          ? "Disponible"
                                          : "Falta Stock"}
                                      </span>
                                    </td>
                                  </tr>

                                  {previewSnapshot.stock_preview.componentsStock.map(
                                    (comp) => (
                                      <tr key={comp.productId}>
                                        <td>
                                          <strong>{comp.productCode}</strong>
                                          <div
                                            style={{
                                              fontSize: "11px",
                                              color: "#64748b",
                                            }}
                                          >
                                            {comp.productName}
                                          </div>
                                        </td>
                                        <td>{comp.requiredQuantity}</td>
                                        <td>{comp.inStock}</td>
                                        <td>{comp.reserved}</td>
                                        <td>
                                          <strong>{comp.available}</strong>
                                        </td>
                                        <td>
                                          <span
                                            className={`tag-badge ${
                                              comp.hasSufficientStock
                                                ? "success"
                                                : "danger"
                                            }`}
                                          >
                                            {comp.hasSufficientStock
                                              ? "Disponible"
                                              : "Falta Stock"}
                                          </span>
                                        </td>
                                      </tr>
                                    ),
                                  )}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p style={{ color: "#64748b", fontSize: "13px" }}>
                              El artículo no requiere seguimiento de stock o no
                              hay almacén asignado.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* STEP 6: Summary & Confirmation */}
                  {activeStep === 6 && previewSnapshot && (
                    <div className="configurator-card">
                      <div className="configurator-card-title">
                        <h3>Paso 6: Resumen de Configuración y Snapshot</h3>
                        <span>
                          Verifica todos los datos antes de confirmar la línea
                        </span>
                      </div>

                      <div className="config-form-grid">
                        <div>
                          <strong>Artículo:</strong>
                          <div>
                            {previewSnapshot.article.code} ·{" "}
                            {previewSnapshot.article.commercial_description ||
                              previewSnapshot.article.technical_description}
                          </div>
                        </div>
                        {previewSnapshot.selected_variant && (
                          <div>
                            <strong>Variante:</strong>
                            <div>
                              {previewSnapshot.selected_variant.code} ·{" "}
                              {previewSnapshot.selected_variant.description}
                            </div>
                          </div>
                        )}
                        <div>
                          <strong>Dimensiones:</strong>
                          <div>
                            {previewSnapshot.dimensions
                              .map(
                                (d) =>
                                  `${d.name}: ${d.value ?? 0} ${d.unit_code}`,
                              )
                              .join(" × ") || "Sin dimensiones"}
                          </div>
                        </div>
                        <div>
                          <strong>Características seleccionadas:</strong>
                          <div>
                            {previewSnapshot.selected_attributes
                              .map((a) => `${a.name}: ${a.value_label}`)
                              .join(", ") || "Sin características"}
                          </div>
                        </div>
                      </div>

                      <div
                        className="config-form-group"
                        style={{ marginTop: "10px" }}
                      >
                        <label>Observaciones de la línea</label>
                        <input
                          type="text"
                          placeholder="Notas opcionales para la línea del presupuesto…"
                          value={customNotes}
                          onChange={(e) => setCustomNotes(e.target.value)}
                        />
                      </div>

                      <div
                        style={{
                          background: "#f8fafc",
                          padding: "14px",
                          borderRadius: "8px",
                          border: "1px solid #e4e2dc",
                          marginTop: "10px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "6px",
                          }}
                        >
                          <span>Precio unitario calculado:</span>
                          <strong>
                            {formatEuro(previewSnapshot.pricing.unit_price)}
                          </strong>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "6px",
                          }}
                        >
                          <span>
                            Cantidad ({previewSnapshot.article.base_unit_code}):
                          </span>
                          <strong>{previewSnapshot.quantity}</strong>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginBottom: "6px",
                          }}
                        >
                          <span>Descuento aplicado:</span>
                          <strong>
                            {previewSnapshot.pricing.discount_percent}% (-
                            {formatEuro(
                              previewSnapshot.pricing.discount_amount *
                                previewSnapshot.quantity,
                            )}
                            )
                          </strong>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            borderTop: "1px solid #cbd5e1",
                            paddingTop: "8px",
                            fontSize: "15px",
                          }}
                        >
                          <span>Importe total neto:</span>
                          <strong style={{ color: "#0f172a" }}>
                            {formatEuro(previewSnapshot.pricing.net_amount)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer Navigation & Actions */}
        <div className="configurator-footer">
          <div className="configurator-footer-summary">
            {previewSnapshot && (
              <>
                <div>
                  <span>Precio unitario: </span>
                  <strong>
                    {formatEuro(previewSnapshot.pricing.unit_price)}
                  </strong>
                </div>
                <div>
                  <span>Importe total línea: </span>
                  <strong style={{ color: "#0284c7" }}>
                    {formatEuro(previewSnapshot.pricing.total_amount)}
                  </strong>
                </div>
              </>
            )}
          </div>

          <div className="configurator-footer-actions">
            {activeStep > 1 && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setActiveStep((s) => s - 1)}
              >
                <ArrowLeft size={15} />
                Anterior
              </button>
            )}

            {activeStep < 6 && (
              <button
                type="button"
                className="secondary-button"
                disabled={!selectedProductId}
                onClick={() => setActiveStep((s) => s + 1)}
              >
                Siguiente
                <ArrowRight size={15} />
              </button>
            )}

            {activeStep === 6 && (
              <button
                type="button"
                className="primary-button"
                disabled={!previewSnapshot}
                onClick={handleConfirm}
              >
                <Check size={16} />
                Confirmar y Añadir a Presupuesto
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
