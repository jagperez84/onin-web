import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  DollarSign,
  Edit3,
  Eye,
  EyeOff,
  FileText,
  HelpCircle,
  Info,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  Sliders,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import {
  loadOtdRuntimeData,
  calculateOtdRuntime,
  buildOtdConfigurationSnapshot,
  fetchProductForOtdComponent,
  type OtdRuntimeData,
  type OtdCalculationResult,
  type OtdConfigurationSnapshot,
  type OtdComponentDef,
} from "../../services/otd/otdCalculationService";
import type {
  Product,
  ProductCharacteristic,
} from "../../services/catalog/productRepository";
import { Toast } from "../../components/ui/Toast";
import { FormulaPredictiveInput } from "./FormulaPredictiveInput";
import "./otd-runtime.css";

const euro = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export function OtdRuntime() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [runtimeData, setRuntimeData] = useState<OtdRuntimeData | null>(null);
  const [customComponents, setCustomComponents] = useState<OtdComponentDef[]>(
    [],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showSnapshotModal, setShowSnapshotModal] = useState(false);
  const [showAddToQuoteModal, setShowAddToQuoteModal] = useState(false);

  // Component Edit / Swap Modal State
  const [editingCompModal, setEditingCompModal] = useState<{
    comp: OtdComponentDef;
    index: number | null; // null = adding new
  } | null>(null);

  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [loadingProductDetails, setLoadingProductDetails] = useState(false);

  const [quotations, setQuotations] = useState<
    Array<{ id: number; code: string; customer_name?: string }>
  >([]);
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(
    null,
  );
  const [addingToQuote, setAddingToQuote] = useState(false);

  const location = useLocation();

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      try {
        setLoading(true);
        const data = await loadOtdRuntimeData(Number(id));
        if (!active) return;
        setRuntimeData(data);
        setCustomComponents(data.components);

        // Prepopulate default values if any
        const initialValues: Record<string, string> = {};
        for (const s of data.selections) {
          if (s.selection_type === "OPTION" && s.options.length > 0) {
            initialValues[s.code] = s.options[0].value ?? s.options[0].code;
          }
        }

        // Merge location state if opened for editing
        const passedInputs =
          location.state?.snapshot?.inputs || location.state?.initialValues;
        if (passedInputs && typeof passedInputs === "object") {
          for (const [k, v] of Object.entries(passedInputs)) {
            if (v !== null && v !== undefined) {
              initialValues[k] = String(v);
            }
          }
        }

        if (location.state?.quotationId) {
          setSelectedQuotationId(Number(location.state.quotationId));
        }

        setValues(initialValues);
      } catch (err: any) {
        if (active)
          setError(err?.message || "Error al cargar el configurador OTD.");
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [id, location.state]);

  // Load active quotations for adding line
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("quotation")
          .select(
            "id, code, customer:customer_id(party:party_id(trade_name, legal_name))",
          )
          .eq("status", "DRAFT")
          .order("id", { ascending: false })
          .limit(15);
        if (data) {
          setQuotations(
            data.map((q: any) => ({
              id: Number(q.id),
              code: q.code || `Presupuesto #${q.id}`,
              customer_name:
                q.customer?.party?.trade_name ||
                q.customer?.party?.legal_name ||
                "Cliente",
            })),
          );
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Check if components have been customized relative to initial loaded data
  const isCustomized = useMemo(() => {
    if (!runtimeData) return false;
    if (customComponents.length !== runtimeData.components.length) return true;
    return (
      JSON.stringify(customComponents) !==
      JSON.stringify(runtimeData.components)
    );
  }, [runtimeData, customComponents]);

  // Effective runtime data with customized components
  const effectiveRuntimeData = useMemo<OtdRuntimeData | null>(() => {
    if (!runtimeData) return null;
    return {
      ...runtimeData,
      components: customComponents,
    };
  }, [runtimeData, customComponents]);

  const calculation = useMemo<OtdCalculationResult | null>(() => {
    if (!effectiveRuntimeData) return null;
    return calculateOtdRuntime(effectiveRuntimeData, values);
  }, [effectiveRuntimeData, values]);

  const snapshot = useMemo<OtdConfigurationSnapshot | null>(() => {
    if (!effectiveRuntimeData || !calculation) return null;
    return buildOtdConfigurationSnapshot(effectiveRuntimeData, calculation);
  }, [effectiveRuntimeData, calculation]);

  // Product Catalog Search
  async function searchCatalog(term: string) {
    setProductSearch(term);
    if (!supabase || term.trim().length < 2) {
      setProductResults([]);
      return;
    }
    try {
      setSearchingProducts(true);
      const clean = `%${term.trim()}%`;
      const { data } = await supabase
        .from("product")
        .select("*")
        .or(
          `code.ilike.${clean},commercial_description.ilike.${clean},technical_description.ilike.${clean}`,
        )
        .limit(12);

      setProductResults((data ?? []) as Product[]);
    } catch {
      setProductResults([]);
    } finally {
      setSearchingProducts(false);
    }
  }

  // Handle selecting a new product for a component
  async function handleSelectProductForComp(product: Product) {
    try {
      setLoadingProductDetails(true);
      const details = await fetchProductForOtdComponent(product.id);
      if (!editingCompModal) return;

      const initialDimExprs: Record<string, string> = {
        ...(editingCompModal.comp.dimension_expressions || {}),
      };
      if (details.dimensions && details.dimensions.length > 0) {
        details.dimensions.forEach((d) => {
          const matchingSelection = (runtimeData?.selections || []).find(
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

      const updatedComp: OtdComponentDef = {
        ...editingCompModal.comp,
        product_id: product.id,
        code: product.code,
        description:
          product.commercial_description ||
          product.technical_description ||
          product.code,
        product: details.product,
        characteristics: details.characteristics,
        dimensions: details.dimensions,
        scales: details.scales,
        characteristic_id:
          details.characteristics.length > 0
            ? details.characteristics[0].id
            : null,
        dimension_expressions: initialDimExprs,
      };

      setEditingCompModal({
        ...editingCompModal,
        comp: updatedComp,
      });
      setProductResults([]);
      setProductSearch("");
      setToast(`Artículo '${product.code}' asignado al componente.`);
    } catch (err: any) {
      setToast(`Error al cargar datos del producto: ${err?.message || err}`);
    } finally {
      setLoadingProductDetails(false);
    }
  }

  const handleOpenEditComponent = async (index: number) => {
    const comp = customComponents[index];
    setEditingCompModal({
      comp: { ...comp },
      index,
    });
    setProductSearch("");
    setProductResults([]);

    if (comp.product_id && (!comp.dimensions || comp.dimensions.length === 0)) {
      try {
        setLoadingProductDetails(true);
        const details = await fetchProductForOtdComponent(comp.product_id);
        const initialDimExprs: Record<string, string> = {
          ...(comp.dimension_expressions || {}),
        };
        if (details.dimensions && details.dimensions.length > 0) {
          details.dimensions.forEach((d) => {
            if (initialDimExprs[d.code] === undefined) {
              const matchingSelection = (runtimeData?.selections || []).find(
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

        setEditingCompModal((prev) => {
          if (!prev || prev.index !== index) return prev;
          return {
            ...prev,
            comp: {
              ...prev.comp,
              product: details.product,
              dimensions: details.dimensions,
              scales: details.scales,
              characteristics: details.characteristics,
              characteristic_id:
                prev.comp.characteristic_id ??
                (details.characteristics.length > 0
                  ? details.characteristics[0].id
                  : null),
              dimension_expressions: initialDimExprs,
            },
          };
        });
      } catch (err) {
        console.error("Error cargando dimensiones del componente:", err);
      } finally {
        setLoadingProductDetails(false);
      }
    }
  };

  const handleOpenAddNewComponent = () => {
    const newComp: OtdComponentDef = {
      id: Date.now(),
      otd_id: runtimeData?.otd.id || 0,
      code: "",
      product_id: null,
      description: "Nuevo Componente Adicional",
      component_type: "IMPROVEMENT",
      quantity_expression: "1",
      dimension_expressions: {},
      characteristic_id: null,
      characteristic_expression: null,
      price_increment: 0,
      price_increment_type: "FIXED",
      active: true,
      sort_order: customComponents.length,
      product: null,
      dimensions: [],
      scales: [],
      characteristics: [],
    };
    setEditingCompModal({
      comp: newComp,
      index: null,
    });
    setProductSearch("");
    setProductResults([]);
  };

  const handleSaveComponentFromModal = () => {
    if (!editingCompModal) return;
    const { comp, index } = editingCompModal;

    if (!comp.product_id && !comp.code) {
      setToast("Debes seleccionar o especificar un artículo del catálogo.");
      return;
    }

    if (index === null) {
      // Add new
      setCustomComponents((prev) => [...prev, comp]);
      setToast("Nuevo componente añadido a esta prueba.");
    } else {
      // Update existing
      setCustomComponents((prev) => {
        const next = [...prev];
        next[index] = comp;
        return next;
      });
      setToast("Componente actualizado para esta prueba.");
    }
    setEditingCompModal(null);
  };

  const handleToggleComponentActive = (index: number) => {
    setCustomComponents((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], active: !next[index].active };
      return next;
    });
  };

  const handleRemoveComponent = (index: number) => {
    setCustomComponents((prev) => prev.filter((_, i) => i !== index));
    setToast("Componente eliminado de esta prueba.");
  };

  const handleResetComponents = () => {
    if (!runtimeData) return;
    setCustomComponents(runtimeData.components);
    setToast("Componentes restablecidos a la definición por defecto del OTD.");
  };

  const handleAddToQuote = async () => {
    if (!snapshot || !calculation || !calculation.isValid) {
      setToast("Completa la configuración antes de añadir al presupuesto.");
      return;
    }

    if (selectedQuotationId === null) {
      // Navigate to QuotationCreate with prepopulated OTD snapshot state
      navigate("/ventas/presupuestos/nuevo", {
        state: {
          otdSnapshot: snapshot,
        },
      });
      return;
    }

    // Add to existing quotation
    setAddingToQuote(true);
    try {
      if (!supabase) throw new Error("Supabase no disponible");
      const { data: existingLines } = await supabase
        .from("quotation_line")
        .select("line_no")
        .eq("quotation_id", selectedQuotationId)
        .order("line_no", { ascending: false })
        .limit(1);

      const nextLineNo = (existingLines?.[0]?.line_no ?? 0) + 1;
      const dimSummary = snapshot.inputs_display
        .filter((i) => i.is_dimension || i.value !== null)
        .map((i) => `${i.name}: ${i.display_value}`)
        .join(", ");

      const desc = `${snapshot.otd_name} (${dimSummary || snapshot.otd_code})`;

      const dimDrafts = (
        snapshot.dimensions ||
        snapshot.inputs_display.filter(
          (i) =>
            i.is_dimension || (typeof i.value === "number" && !isNaN(i.value)),
        )
      )
        .map((i, idx) => ({
          code: i.code,
          name: i.name,
          value:
            typeof i.value === "number"
              ? i.value
              : parseFloat(String(i.value)) || null,
          unit_id: null,
          sort_order: idx,
        }))
        .filter((d) => d.code && d.name);

      if (location.state?.lineId) {
        // Update existing line
        const { error: updateError } = await supabase
          .from("quotation_line")
          .update({
            description: desc,
            unit_price: snapshot.total_amount,
            net_amount: snapshot.total_amount,
            tax_amount: round2(snapshot.total_amount * 0.21),
            total_amount: round2(snapshot.total_amount * 1.21),
            specific_data: {
              otd_snapshot: snapshot,
              configuration_snapshot: snapshot,
              is_otd: true,
              otd_id: snapshot.otd_id,
            },
          })
          .eq("id", location.state.lineId);

        if (updateError) throw updateError;

        await supabase
          .from("quotation_line_dimension")
          .delete()
          .eq("quotation_line_id", location.state.lineId);
        if (dimDrafts.length > 0) {
          await supabase
            .from("quotation_line_dimension")
            .insert(
              dimDrafts.map((d) => ({
                ...d,
                quotation_line_id: location.state.lineId,
              })),
            );
        }

        setToast(
          `Línea del presupuesto ${selectedQuotationId} actualizada con éxito.`,
        );
        setShowAddToQuoteModal(false);
        navigate(`/ventas/presupuestos/${selectedQuotationId}`);
        return;
      }

      const { data: insertedLine, error: insertError } = await supabase
        .from("quotation_line")
        .insert({
          quotation_id: selectedQuotationId,
          line_no: nextLineNo,
          description: desc,
          quantity: 1,
          unit_price: snapshot.total_amount,
          discount_percent: 0,
          tax_percent: 21,
          net_amount: snapshot.total_amount,
          tax_amount: round2(snapshot.total_amount * 0.21),
          total_amount: round2(snapshot.total_amount * 1.21),
          specific_data: {
            otd_snapshot: snapshot,
            configuration_snapshot: snapshot,
            is_otd: true,
            otd_id: snapshot.otd_id,
          },
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      if (dimDrafts.length > 0 && insertedLine?.id) {
        await supabase
          .from("quotation_line_dimension")
          .insert(
            dimDrafts.map((d) => ({
              ...d,
              quotation_line_id: insertedLine.id,
            })),
          );
      }

      setToast(
        `Línea añadida con éxito al presupuesto ${selectedQuotationId}.`,
      );
      setShowAddToQuoteModal(false);
      navigate(`/ventas/presupuestos/${selectedQuotationId}`);
    } catch (err: any) {
      setToast(`Error al añadir la línea: ${err?.message || err}`);
    } finally {
      setAddingToQuote(false);
    }
  };

  const copySnapshotJson = () => {
    if (!snapshot) return;
    navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    setToast("Snapshot inmutable copiado al portapapeles.");
  };

  if (loading) {
    return (
      <div className="otd-runtime-page">
        <div className="otd-runtime-empty">Cargando configurador OTD…</div>
      </div>
    );
  }

  if (error || !runtimeData) {
    return (
      <div className="otd-runtime-page">
        <div className="otd-runtime-error">{error || "OTD no encontrado."}</div>
      </div>
    );
  }

  const { otd, selections, variables, scales } = runtimeData;
  const isReady = calculation?.isValid ?? false;
  const otdBasePrice = calculation?.otdBasePrice ?? 0;
  const totalIncrements = calculation?.totalIncrements ?? 0;
  const totalFinal = calculation?.totalAmount ?? 0;

  return (
    <div className="otd-runtime-page">
      {/* Top Header */}
      <div className="otd-runtime-head">
        <div>
          <NavLink
            to={`/produccion/otd/${otd.id}`}
            className="otd-runtime-back"
          >
            <ArrowLeft size={15} /> Volver al Editor Técnico
          </NavLink>
          <div className="eyebrow">CONFIGURADOR OTD · OFICINA & PRUEBAS</div>
          <h1>{otd.name}</h1>
          <p>
            {otd.code} · Introduce las medidas y características. El sistema
            resolverá automáticamente el escalado del artículo, su precio base y
            los incrementos configurados. Puedes cambiar o añadir componentes
            libremente para esta prueba.
          </p>
        </div>

        <div className="otd-runtime-actions-top">
          {isCustomized ? (
            <div
              className="badge-customized-pill"
              title="Componentes adaptados para esta prueba"
            >
              <Sparkles size={14} /> Componentes adaptados
            </div>
          ) : (
            <div className="runtime-status">
              <CheckCircle2 size={15} /> OTD Activo
            </div>
          )}
          <button
            type="button"
            className="otd-btn-secondary"
            onClick={() => setShowSnapshotModal(true)}
            title="Ver Snapshot de Configuración"
          >
            <FileText size={15} /> Ver Snapshot
          </button>
        </div>
      </div>

      <div className="otd-runtime-grid">
        {/* Left Column: Office Inputs Form */}
        <div className="otd-runtime-col-main">
          <section className="otd-runtime-card">
            <div className="runtime-card-head">
              <div>
                <h2>1. Datos de Entrada de Oficina</h2>
                <p>
                  Información requerida para el dimensionamiento y selección de
                  acabados.
                </p>
              </div>
              <Ruler size={20} className="text-muted" />
            </div>

            <div className="runtime-inputs">
              {selections.map((s) => (
                <label key={s.id} className="runtime-input-field">
                  <span>
                    {s.name} {s.required && <b className="text-danger">*</b>}
                    {s.is_dimension && (
                      <span className="tag-dimension">Dimensión</span>
                    )}
                  </span>

                  {s.selection_type === "OPTION" ? (
                    <select
                      value={values[s.code] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [s.code]: e.target.value }))
                      }
                      className="runtime-select"
                    >
                      <option value="">Seleccionar…</option>
                      {s.options.map((o) => (
                        <option key={o.id} value={o.value ?? o.code}>
                          {o.label || o.code}
                        </option>
                      ))}
                    </select>
                  ) : s.selection_type === "BOOLEAN" ? (
                    <select
                      value={values[s.code] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [s.code]: e.target.value }))
                      }
                      className="runtime-select"
                    >
                      <option value="">Seleccionar…</option>
                      <option value="true">Sí</option>
                      <option value="false">No</option>
                    </select>
                  ) : s.selection_type === "TEXT" ? (
                    <input
                      type="text"
                      value={values[s.code] ?? ""}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [s.code]: e.target.value }))
                      }
                      placeholder={`Introduce ${s.name.toLowerCase()}`}
                      className="runtime-input"
                    />
                  ) : (
                    <div className="input-with-unit">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={values[s.code] ?? ""}
                        onChange={(e) =>
                          setValues((v) => ({ ...v, [s.code]: e.target.value }))
                        }
                        placeholder="0"
                        className="runtime-input"
                      />
                      <span className="unit-label">
                        {s.unit?.symbol ||
                          s.unit?.code ||
                          (s.is_dimension
                            ? runtimeData?.workUnit?.symbol ||
                              runtimeData?.workUnit?.code ||
                              "mm"
                            : "ud")}
                      </span>
                    </div>
                  )}
                </label>
              ))}
            </div>

            {calculation?.requiredMissing &&
              calculation.requiredMissing.length > 0 && (
                <div className="runtime-warning">
                  <Info size={16} />
                  <span>
                    Campos obligatorios pendientes:{" "}
                    <strong>{calculation.requiredMissing.join(", ")}</strong>
                  </span>
                </div>
              )}
          </section>

          {/* 3-Pill Mathematical Composition Bar */}
          <div className="otd-price-math-bar">
            <div className="math-item">
              <span className="math-label">1. Precio Base (Escalado OTD)</span>
              <span className="math-amount">{euro(otdBasePrice)}</span>
            </div>

            <div className="math-operator">+</div>

            <div className="math-item">
              <span className="math-label">2. Añadidos y Mejoras</span>
              <span className="math-amount">{euro(totalIncrements)}</span>
            </div>

            <div className="math-operator">=</div>

            <div className="math-item highlight-total">
              <span className="math-label">PRECIO TOTAL CONFIGURACIÓN</span>
              <span className="math-amount">{euro(totalFinal)}</span>
            </div>
          </div>

          {/* Office Clean Component Summary & Pricing with Swapping capability */}
          <section className="otd-runtime-card">
            <div className="runtime-card-head">
              <div>
                <h2>2. Desglose de Componentes y Precio Base</h2>
                <p>
                  Incluye el escalado base del OTD y los componentes
                  configurados. Puedes cambiar o añadir componentes para esta
                  prueba.
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {isCustomized && (
                  <button
                    type="button"
                    className="otd-btn-secondary mini"
                    onClick={handleResetComponents}
                    title="Restablecer componentes a la definición original del OTD"
                  >
                    <RotateCcw size={13} /> Restaurar originales
                  </button>
                )}
                <button
                  type="button"
                  className="otd-btn-secondary mini"
                  onClick={handleOpenAddNewComponent}
                >
                  <Plus size={13} /> Añadir componente
                </button>
                <span className="runtime-price-badge">{euro(totalFinal)}</span>
              </div>
            </div>

            <div className="otd-clean-component-list">
              {/* SPECIAL ROW 1: OTD BASE PRICE FROM SCALE MATRIX */}
              <div className="otd-clean-component-row base-price-row">
                <div className="comp-info">
                  <div className="comp-title">
                    <strong>Tarifa Base OTD por Escalado de Medidas</strong>
                    <span className="badge-base-included">
                      <Sliders size={12} /> Base Incluida
                    </span>
                    <span className="badge-base-tag">{otd.code}</span>
                  </div>

                  <div className="comp-subtext">
                    {calculation?.otdScaleStepUsed ? (
                      <span>
                        Escalón de matriz aplicado:{" "}
                        <b>
                          {calculation.otdScaleStepUsed.dimension_1}
                          {calculation.otdScaleStepUsed.dimension_2 != null
                            ? ` × ${calculation.otdScaleStepUsed.dimension_2}`
                            : ""}{" "}
                          {runtimeData?.workUnit?.symbol ||
                            runtimeData?.workUnit?.code ||
                            "mm"}
                        </b>
                      </span>
                    ) : scales.length > 0 ? (
                      <span>
                        Matriz de escalado OTD ({scales.length} escalones
                        configurados)
                      </span>
                    ) : (
                      <span>
                        OTD sin matriz de escalado directo (suma por
                        componentes)
                      </span>
                    )}
                  </div>
                </div>

                <div className="comp-pricing">
                  <div className="comp-unit-price">Precio Base</div>
                  <div className="comp-total-price">
                    <strong>{euro(otdBasePrice)}</strong>
                  </div>
                </div>
              </div>

              {/* COMPONENT ROWS */}
              {calculation?.components.map((c, idx) => {
                const compDef = customComponents[idx];
                const isInactive = compDef && !compDef.active;

                return (
                  <div
                    key={c.id || idx}
                    className={`otd-clean-component-row ${!c.ok ? "is-error" : ""} ${isInactive ? "is-inactive" : ""}`}
                  >
                    <div className="comp-info">
                      <div className="comp-title">
                        <strong>{c.product_name}</strong>
                        <span className="comp-code">{c.product_code}</span>

                        {c.component_type === "IMPROVEMENT" ? (
                          <span className="badge-improvement">
                            <TrendingUp size={11} /> Mejora (
                              {c.price_increment_type === "PERCENTAGE"
                                ? `+${c.price_increment}%`
                                : `+${euro(c.price_increment)}`}
                            )
                          </span>
                        ) : (
                          <span className="badge-base-tag">
                            Básico (incluido en base)
                          </span>
                        )}

                        {isInactive && (
                          <span
                            className="text-danger"
                            style={{ fontSize: 11, fontWeight: 600 }}
                          >
                            (Desactivado para esta prueba)
                          </span>
                        )}
                      </div>

                      <div className="comp-subtext">
                        {c.characteristic_name && (
                          <span>
                            Acabado: <b>{c.characteristic_name}</b> ·{" "}
                          </span>
                        )}
                        <span>
                          Cantidad: <b>{c.quantity}</b>{" "}
                          {c.unit_symbol || c.unit_code || "ud"}
                        </span>
                        {c.dimension_list.length > 0 && (
                          <span>
                            {" "}
                            · Medidas:{" "}
                            <b>
                              {c.dimension_list
                                .map(
                                  (d) =>
                                    `${d.name}: ${d.value} ${d.unit_symbol || d.unit_code || "mm"}${
                                      d.raw_value != null &&
                                      d.raw_unit_code &&
                                      d.raw_unit_code.toLowerCase() !==
                                        (d.unit_code || "mm").toLowerCase()
                                        ? ` (de ${d.raw_value} ${d.raw_unit_symbol || d.raw_unit_code})`
                                        : ""
                                    }`,
                                )
                                .join(" × ")}
                            </b>
                          </span>
                        )}
                      </div>

                      {c.scale_step_used && (
                        <div className="comp-scale-pill">
                          Escalón de artículo: {c.scale_step_used.dimension_1}
                          {c.scale_step_used.dimension_2 != null
                            ? ` × ${c.scale_step_used.dimension_2}`
                            : ""}{" "}
                          {c.unit_symbol || "mm"} &rarr; {euro(c.base_price)}
                        </div>
                      )}

                      {!c.ok && (
                        <div className="comp-error-msg">
                          {c.formula_error ||
                            "No se pudo resolver el precio del escalado."}
                        </div>
                      )}
                    </div>

                    <div className="comp-right-wrap">
                      <div className="comp-pricing">
                        <div className="comp-unit-price">
                          {c.component_type === "IMPROVEMENT" &&
                          c.increment_amount > 0
                            ? `+${euro(c.unit_price)}`
                            : euro(c.unit_price)}
                          {c.quantity > 1 && (
                            <small>
                              {" "}
                              / {c.unit_symbol || c.unit_code || "ud"}
                            </small>
                          )}
                        </div>
                        <div className="comp-total-price">
                          <strong>
                            {c.component_type === "IMPROVEMENT" &&
                            c.total_price > 0
                              ? `+${euro(c.total_price)}`
                              : euro(c.total_price)}
                          </strong>
                        </div>
                      </div>

                      <div className="comp-actions-inline">
                        <button
                          type="button"
                          className="comp-btn-action"
                          onClick={() => handleOpenEditComponent(idx)}
                          title="Cambiar artículo o modificar componente para esta prueba"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          type="button"
                          className="comp-btn-action"
                          onClick={() => handleToggleComponentActive(idx)}
                          title={
                            isInactive
                              ? "Activar componente"
                              : "Desactivar componente"
                          }
                        >
                          {isInactive ? (
                            <EyeOff size={14} />
                          ) : (
                            <Eye size={14} />
                          )}
                        </button>
                        <button
                          type="button"
                          className="comp-btn-action text-danger"
                          onClick={() => handleRemoveComponent(idx)}
                          title="Eliminar de esta prueba"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Office Summary Bar */}
            <div className="otd-office-summary-bar">
              <div className="summary-left">
                <div className="summary-label">PRECIO TOTAL CALCULADO</div>
                <div className="summary-amount">{euro(totalFinal)}</div>
                <div className="summary-hint">
                  {isReady
                    ? `Base (${euro(otdBasePrice)}) + Mejoras (${euro(totalIncrements)}) = Total ${euro(totalFinal)}.`
                    : "Introduce las dimensiones requeridas para completar el cálculo."}
                </div>
              </div>

              <div className="summary-actions">
                <button
                  type="button"
                  className="otd-btn-primary"
                  disabled={!isReady}
                  onClick={() => setShowAddToQuoteModal(true)}
                >
                  <Plus size={16} /> Añadir al presupuesto
                </button>
              </div>
            </div>
          </section>

          {/* Expandable Technical Details (Variables, Raw Formulas, Scale Search) */}
          <section className="otd-runtime-card technical-accordion">
            <button
              type="button"
              className="technical-accordion-toggle"
              onClick={() => setShowTechnicalDetails((v) => !v)}
            >
              <div className="toggle-left">
                <Calculator size={18} />
                <span>
                  <strong>Ver detalles técnicos del OTD</strong> (Variables
                  internas, fórmulas y matriz de escalado)
                </span>
              </div>
              {showTechnicalDetails ? (
                <ChevronUp size={18} />
              ) : (
                <ChevronDown size={18} />
              )}
            </button>

            {showTechnicalDetails && (
              <div className="technical-accordion-content">
                <div className="tech-section-title">
                  Variables Calculadas en Runtime
                </div>
                <div className="runtime-variable-grid">
                  {variables.length === 0 ? (
                    <div className="runtime-muted">
                      No hay variables calculadas en este OTD.
                    </div>
                  ) : (
                    variables.map((v) => (
                      <div key={v.id} className="tech-variable-card">
                        <div className="var-header">
                          <span className="var-name">{v.name}</span>
                          <code className="var-code">{v.code}</code>
                        </div>
                        <div className="var-expr">
                          Fórmula: <code>{v.expression || "—"}</code>
                        </div>
                        <div className="var-val">
                          Valor:{" "}
                          <strong>
                            {Number.isFinite(
                              calculation?.resolvedVariables[v.code],
                            )
                              ? calculation?.resolvedVariables[
                                  v.code
                                ].toLocaleString("es-ES", {
                                  maximumFractionDigits: 2,
                                })
                              : "—"}
                          </strong>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="tech-section-title" style={{ marginTop: 20 }}>
                  Inspección de Fórmulas y Escalados por Componente
                </div>
                <div className="tech-table">
                  <div className="tech-table-head">
                    <span>Componente</span>
                    <span>Tipo</span>
                    <span>Dimensiones Buscadas</span>
                    <span>Escalón / Precio Base</span>
                    <span>Incremento</span>
                    <span>Unitario</span>
                    <span>Total</span>
                  </div>
                  {calculation?.components.map((c, i) => (
                    <div key={i} className="tech-table-row">
                      <span>
                        <strong>{c.product_code}</strong>
                        <small>{c.description}</small>
                      </span>
                      <span>
                        <span
                          className={`tag-comp-type ${c.component_type.toLowerCase()}`}
                        >
                          {c.component_type === "BASIC" ? "Básico" : "Mejora"}
                        </span>
                      </span>
                      <span>
                        {c.dimension_list.length > 0
                          ? c.dimension_list
                              .map(
                                (d) =>
                                  `${d.code}=${d.value} ${d.unit_symbol || d.unit_code || "mm"}${
                                    d.raw_value != null &&
                                    d.raw_unit_code &&
                                    d.raw_unit_code.toLowerCase() !==
                                      (d.unit_code || "mm").toLowerCase()
                                      ? ` (de ${d.raw_value} ${d.raw_unit_symbol || d.raw_unit_code})`
                                      : ""
                                  }`,
                              )
                              .join(", ")
                          : "Sin dimensiones"}
                      </span>
                      <span>
                        {c.scale_step_used
                          ? `${c.scale_step_used.dimension_1} × ${c.scale_step_used.dimension_2 ?? "—"} ${c.unit_symbol || "mm"} (${euro(c.base_price)})`
                          : euro(c.base_price)}
                      </span>
                      <span>
                        {c.component_type === "IMPROVEMENT" &&
                        c.price_increment > 0
                          ? c.price_increment_type === "PERCENTAGE"
                            ? `+${c.price_increment}% (${euro(c.increment_amount)})`
                            : `+${euro(c.increment_amount)}`
                          : "0,00 €"}
                      </span>
                      <span>{euro(c.unit_price)}</span>
                      <span>
                        <strong>{euro(c.total_price)}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modal: Change / Edit Component for this Test */}
      {editingCompModal && (
        <div className="otd-modal-overlay" role="dialog" aria-modal="true">
          <div className="otd-modal-box wide">
            <div className="otd-modal-header">
              <div className="modal-title-wrap">
                <span className="eyebrow">CONFIGURACIÓN DE PRUEBA</span>
                <h3>
                  {editingCompModal.index === null
                    ? "Añadir Componente a la Prueba"
                    : "Cambiar o Personalizar Componente"}
                </h3>
              </div>
              <button
                type="button"
                className="otd-modal-close"
                onClick={() => setEditingCompModal(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="otd-modal-body">
              {/* Product Catalog Search */}
              <div className="quote-select-field">
                <label>
                  <span>Buscar Artículo del Catálogo ONIN</span>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      placeholder="Escribe código o descripción (ej. MOT, LONA, PERFIL...)"
                      value={productSearch}
                      onChange={(e) => searchCatalog(e.target.value)}
                      className="runtime-input"
                    />
                    {searchingProducts && (
                      <span
                        style={{
                          position: "absolute",
                          right: 12,
                          top: 10,
                          fontSize: 12,
                          color: "#64748b",
                        }}
                      >
                        Buscando…
                      </span>
                    )}
                  </div>
                </label>

                {productResults.length > 0 && (
                  <div className="search-results-list">
                    {productResults.map((p) => (
                      <div
                        key={p.id}
                        className="search-result-item"
                        onClick={() => handleSelectProductForComp(p)}
                      >
                        <div>
                          <strong>
                            {p.commercial_description ||
                              p.technical_description ||
                              p.code}
                          </strong>
                        </div>
                        <span className="search-result-code">{p.code}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Current Selected Product Display */}
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e4e2dc",
                  borderRadius: 8,
                  padding: "12px 16px",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#64748b",
                    textTransform: "uppercase",
                  }}
                >
                  Artículo Asignado
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#0f172a",
                    marginTop: 2,
                  }}
                >
                  {editingCompModal.comp.product?.commercial_description ||
                    editingCompModal.comp.description ||
                    editingCompModal.comp.code ||
                    "Ningún artículo seleccionado"}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  Código:{" "}
                  <code>
                    {editingCompModal.comp.product?.code ||
                      editingCompModal.comp.code ||
                      "—"}
                  </code>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                }}
              >
                {/* Finish / Characteristic selector */}
                <label className="runtime-input-field">
                  <span>Acabado / Característica</span>
                  <select
                    value={editingCompModal.comp.characteristic_id ?? ""}
                    onChange={(e) =>
                      setEditingCompModal({
                        ...editingCompModal,
                        comp: {
                          ...editingCompModal.comp,
                          characteristic_id: e.target.value
                            ? Number(e.target.value)
                            : null,
                        },
                      })
                    }
                    className="runtime-select"
                  >
                    <option value="">Sin acabado específico (estándar)</option>
                    {(editingCompModal.comp.characteristics ?? []).map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.code} — {ch.description || ch.code}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Component Type (Basic vs Improvement) */}
                <label className="runtime-input-field">
                  <span>Tipo de Componente</span>
                  <select
                    value={editingCompModal.comp.component_type}
                    onChange={(e) =>
                      setEditingCompModal({
                        ...editingCompModal,
                        comp: {
                          ...editingCompModal.comp,
                          component_type: e.target.value as
                            "BASIC" | "IMPROVEMENT",
                        },
                      })
                    }
                    className="runtime-select"
                  >
                    <option value="BASIC">
                      Básico (incluido en tarifa base)
                    </option>
                    <option value="IMPROVEMENT">
                      Mejora (con incremento de precio)
                    </option>
                  </select>
                </label>
              </div>

              {/* Increments fields if Improvement */}
              {editingCompModal.comp.component_type === "IMPROVEMENT" && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                    marginTop: 16,
                    padding: 14,
                    background: "#efe9df",
                    border: "1px solid #fef3c7",
                    borderRadius: 8,
                  }}
                >
                  <label className="runtime-input-field">
                    <span>Tipo de Incremento</span>
                    <select
                      value={editingCompModal.comp.price_increment_type}
                      onChange={(e) =>
                        setEditingCompModal({
                          ...editingCompModal,
                          comp: {
                            ...editingCompModal.comp,
                            price_increment_type: e.target.value as
                              "FIXED" | "PERCENTAGE",
                          },
                        })
                      }
                      className="runtime-select"
                    >
                      <option value="FIXED">Importe Fijo (€)</option>
                      <option value="PERCENTAGE">
                        Porcentaje sobre base (%)
                      </option>
                    </select>
                  </label>

                  <label className="runtime-input-field">
                    <span>Valor del Incremento</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editingCompModal.comp.price_increment}
                      onChange={(e) =>
                        setEditingCompModal({
                          ...editingCompModal,
                          comp: {
                            ...editingCompModal.comp,
                            price_increment: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="runtime-input"
                    />
                  </label>
                </div>
              )}

              {/* Quantity */}
              <div style={{ marginTop: 16 }}>
                <label className="runtime-input-field">
                  <span>Cantidad o Fórmula de Cantidad</span>
                  <input
                    type="text"
                    value={editingCompModal.comp.quantity_expression || "1"}
                    onChange={(e) =>
                      setEditingCompModal({
                        ...editingCompModal,
                        comp: {
                          ...editingCompModal.comp,
                          quantity_expression: e.target.value,
                        },
                      })
                    }
                    placeholder="1, o fórmula ej. MOTORIZACION"
                    className="runtime-input"
                  />
                </label>
              </div>

              {/* Cutting / Manufacturing Dimensions (Only if the article has dimensions) */}
              {editingCompModal.comp.dimensions &&
                editingCompModal.comp.dimensions.length > 0 && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: 14,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "#334155",
                        marginBottom: 6,
                      }}
                    >
                      <Ruler size={14} style={{ color: "#0284c7" }} />
                      <span>
                        Dimensiones y Fórmulas de Corte del Artículo (
                        {editingCompModal.comp.dimensions.length})
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: 11.5,
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
                          editingCompModal.comp.dimensions.length > 1
                            ? "1fr 1fr"
                            : "1fr",
                        gap: 10,
                      }}
                    >
                      {editingCompModal.comp.dimensions.map((d) => {
                        const dimUnitSymbol =
                          d.unit_symbol || d.unit_code || "mm";
                        const workUnitSymbol =
                          runtimeData?.workUnit?.symbol ||
                          runtimeData?.workUnit?.code ||
                          "mm";
                        const isDifferent =
                          dimUnitSymbol.toLowerCase() !==
                          workUnitSymbol.toLowerCase();

                        return (
                          <div
                            key={d.code}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                            }}
                          >
                            <FormulaPredictiveInput
                              label={`${d.name || d.code} (${dimUnitSymbol})`}
                              value={
                                editingCompModal.comp.dimension_expressions?.[
                                  d.code
                                ] ?? ""
                              }
                              onChange={(val) =>
                                setEditingCompModal({
                                  ...editingCompModal,
                                  comp: {
                                    ...editingCompModal.comp,
                                    dimension_expressions: {
                                      ...editingCompModal.comp
                                        .dimension_expressions,
                                      [d.code]: val,
                                    },
                                  },
                                })
                              }
                              placeholder={`Ej. ${d.code} o ${d.code} - 50`}
                              availableInputs={runtimeData?.selections || []}
                              availableVariables={runtimeData?.variables || []}
                              compact
                            />
                            {isDifferent && (
                              <div
                                style={{
                                  fontSize: 10,
                                  color: "#0284c7",
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

            <div className="otd-modal-footer">
              <button
                type="button"
                className="otd-btn-secondary"
                onClick={() => setEditingCompModal(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="otd-btn-primary"
                onClick={handleSaveComponentFromModal}
              >
                Aplicar a esta Prueba
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add To Quote Modal */}
      {showAddToQuoteModal && (
        <div className="otd-modal-overlay" role="dialog" aria-modal="true">
          <div className="otd-modal-box">
            <div className="otd-modal-header">
              <div className="modal-title-wrap">
                <span className="eyebrow">PRESUPUESTACIÓN</span>
                <h3>Añadir OTD al Presupuesto</h3>
              </div>
              <button
                type="button"
                className="otd-modal-close"
                onClick={() => setShowAddToQuoteModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="otd-modal-body">
              <p>
                Se generará un <strong>snapshot inmutable</strong> con las
                medidas, componentes personalizados, escalados e incrementos
                calculados en este momento.
              </p>

              <div className="quote-summary-mini">
                <div>
                  <strong>{otd.name}</strong>
                  <div className="text-muted" style={{ fontSize: "13px" }}>
                    {snapshot?.inputs_display
                      .map((i) => `${i.name}: ${i.display_value}`)
                      .join(" · ")}
                  </div>
                </div>
                <div className="mini-price">{euro(totalFinal)}</div>
              </div>

              <div className="quote-select-field">
                <label>
                  <span>Destino del Presupuesto</span>
                  <select
                    value={selectedQuotationId ?? ""}
                    onChange={(e) =>
                      setSelectedQuotationId(
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  >
                    <option value="">
                      Crear un NUEVO Presupuesto con esta configuración
                    </option>
                    {quotations.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.code} — {q.customer_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="otd-modal-footer">
              <button
                type="button"
                className="otd-btn-secondary"
                onClick={() => setShowAddToQuoteModal(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="otd-btn-primary"
                disabled={addingToQuote}
                onClick={handleAddToQuote}
              >
                {addingToQuote ? "Añadiendo…" : "Confirmar y Añadir"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snapshot Inspector Modal */}
      {showSnapshotModal && snapshot && (
        <div className="otd-modal-overlay" role="dialog" aria-modal="true">
          <div className="otd-modal-box wide">
            <div className="otd-modal-header">
              <div className="modal-title-wrap">
                <span className="eyebrow">SNAPSHOT INMUTABLE</span>
                <h3>Snapshot de Configuración OTD</h3>
              </div>
              <div className="header-actions-right">
                <button
                  type="button"
                  className="otd-btn-secondary mini"
                  onClick={copySnapshotJson}
                >
                  <Copy size={13} /> Copiar JSON
                </button>
                <button
                  type="button"
                  className="otd-modal-close"
                  onClick={() => setShowSnapshotModal(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="otd-modal-body">
              <div className="snapshot-meta-banner">
                <div>
                  <strong>OTD:</strong> {snapshot.otd_name} ({snapshot.otd_code}
                  )
                </div>
                <div>
                  <strong>Creado:</strong>{" "}
                  {new Date(snapshot.created_at).toLocaleString("es-ES")}
                </div>
                <div>
                  <strong>Total:</strong> {euro(snapshot.total_amount)}
                </div>
              </div>

              <div className="snapshot-grid-sections">
                <div>
                  <h4>1. Entradas Registradas</h4>
                  <ul className="snapshot-list">
                    {snapshot.inputs_display.map((i) => (
                      <li key={i.code}>
                        <span>{i.name}:</span>{" "}
                        <strong>{i.display_value}</strong>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4>2. Variables Resueltas</h4>
                  <ul className="snapshot-list">
                    {snapshot.variables_display.map((v) => (
                      <li key={v.code}>
                        <span>
                          {v.name} ({v.code}):
                        </span>{" "}
                        <strong>{v.value}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <h4 style={{ marginTop: 16 }}>3. Componentes Congelados</h4>
              <div className="tech-table">
                <div className="tech-table-head">
                  <span>Artículo</span>
                  <span>Cantidad</span>
                  <span>Escalón Usado</span>
                  <span>Precio Base</span>
                  <span>Incremento</span>
                  <span>Precio Unitario</span>
                  <span>Total</span>
                </div>
                {snapshot.components.map((c, i) => (
                  <div key={i} className="tech-table-row">
                    <span>
                      <strong>{c.product_code}</strong>
                      <small>{c.product_name}</small>
                    </span>
                    <span>{c.quantity}</span>
                    <span>
                      {c.scale_step_used
                        ? `${c.scale_step_used.dimension_1} × ${c.scale_step_used.dimension_2 ?? "—"} mm`
                        : "—"}
                    </span>
                    <span>{euro(c.base_price)}</span>
                    <span>
                      {c.increment_amount > 0
                        ? `+${euro(c.increment_amount)} (${c.price_increment_type === "PERCENTAGE" ? `${c.price_increment}%` : "fijo"})`
                        : "0,00 €"}
                    </span>
                    <span>{euro(c.unit_price)}</span>
                    <span>
                      <strong>{euro(c.total_price)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="otd-modal-footer">
              <button
                type="button"
                className="otd-btn-secondary"
                onClick={() => setShowSnapshotModal(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast("")} />}
    </div>
  );
}

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}
