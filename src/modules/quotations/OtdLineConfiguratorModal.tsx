import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import {
  loadOtdRuntimeData,
  calculateOtdRuntime,
  buildOtdConfigurationSnapshot,
  listActiveOtds,
  type OtdRuntimeData,
  type OtdCalculationResult,
  type OtdConfigurationSnapshot,
  type OtdSummary,
  type OtdComponentDef,
} from "../../services/otd/otdCalculationService";
import type { QuotationLineDimensionDraft } from "../../services/sales/quotationCreationRepository";
import { OtdSelectionStep } from "./otdConfigurator/OtdSelectionStep";
import { OtdInputsForm } from "./otdConfigurator/OtdInputsForm";
import { OtdBreakdownPanel } from "./otdConfigurator/OtdBreakdownPanel";
import { OtdComponentEditModal } from "./otdConfigurator/OtdComponentEditModal";
import type { EditingCompModalState } from "./otdConfigurator/types";
import "./quotation-configurator.css";

export type OtdLineConfiguratorModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    snapshot: OtdConfigurationSnapshot,
    lineData: {
      description: string;
      unitPrice: number;
      quantity: number;
      dimensions: QuotationLineDimensionDraft[];
      otdId: number;
    },
  ) => void;
  initialOtdId?: number | null;
  initialSnapshot?: OtdConfigurationSnapshot | any | null;
  initialValues?: Record<string, any>;
  initialQuantity?: number;
  lineIndex?: number | null;
};

export function OtdLineConfiguratorModal({
  isOpen,
  onClose,
  onConfirm,
  initialOtdId = null,
  initialSnapshot = null,
  initialValues = {},
  initialQuantity = 1,
  lineIndex = null,
}: OtdLineConfiguratorModalProps) {
  const [selectedOtdId, setSelectedOtdId] = useState<number | null>(
    initialOtdId || initialSnapshot?.otd_id || null,
  );

  // Catalog of available OTDs (for step 1 when no OTD is pre-selected)
  const [otdList, setOtdList] = useState<OtdSummary[]>([]);
  const [loadingOtdList, setLoadingOtdList] = useState(false);
  const [otdSearch, setOtdSearch] = useState("");

  // Runtime engine state
  const [runtimeData, setRuntimeData] = useState<OtdRuntimeData | null>(null);
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const [runtimeError, setRuntimeError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState<number>(initialQuantity || 1);
  const [notes, setNotes] = useState<string>("");

  // Customizable components for this OTD configuration
  const [customComponents, setCustomComponents] = useState<OtdComponentDef[]>(
    [],
  );

  // Component editing modal state
  const [editingCompModal, setEditingCompModal] =
    useState<EditingCompModalState>(null);

  // Track initial open to avoid overwriting user selections
  const prevIsOpenRef = useRef(false);

  // Sync on modal open
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setQuantity(initialQuantity > 0 ? initialQuantity : 1);
      setNotes(initialSnapshot?.notes || "");
      const targetOtdId = initialOtdId || initialSnapshot?.otd_id || null;
      setSelectedOtdId(targetOtdId);
      if (!targetOtdId) {
        setRuntimeData(null);
        setCustomComponents([]);
        setValues({});
        setRuntimeError("");
        setLoadingOtdList(true);
        listActiveOtds()
          .then((list) => setOtdList(list))
          .catch((err) => console.error("Error cargando lista de OTDs:", err))
          .finally(() => setLoadingOtdList(false));
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialOtdId, initialSnapshot, initialQuantity]);

  // Load available OTDs when selectedOtdId is cleared to pick another
  useEffect(() => {
    if (isOpen && !selectedOtdId && otdList.length === 0 && !loadingOtdList) {
      setLoadingOtdList(true);
      listActiveOtds()
        .then((list) => setOtdList(list))
        .catch((err) => console.error("Error cargando lista de OTDs:", err))
        .finally(() => setLoadingOtdList(false));
    }
  }, [isOpen, selectedOtdId, otdList.length, loadingOtdList]);

  // Load runtime data whenever selectedOtdId is set
  useEffect(() => {
    if (!isOpen || !selectedOtdId) return;

    let active = true;
    setLoadingRuntime(true);
    setRuntimeError("");

    loadOtdRuntimeData(selectedOtdId)
      .then((data) => {
        if (!active) return;
        setRuntimeData(data);

        // Prepopulate defaults from definition
        const defaults: Record<string, string> = {};
        for (const s of data.selections) {
          if (s.selection_type === "OPTION" && s.options.length > 0) {
            defaults[s.code] = s.options[0].value ?? s.options[0].code;
          } else if (s.selection_type === "BOOLEAN") {
            defaults[s.code] = "false";
          } else {
            defaults[s.code] = "";
          }
        }

        // Merge initial values or snapshot inputs if provided
        const prevInputs = initialSnapshot?.inputs || initialValues;
        if (prevInputs && typeof prevInputs === "object") {
          for (const [k, v] of Object.entries(prevInputs)) {
            if (v !== null && v !== undefined && v !== "") {
              defaults[k] = String(v);
            }
          }
        }

        setValues(defaults);

        // Initialize components with snapshot or runtime defaults
        if (
          initialSnapshot?.components &&
          Array.isArray(initialSnapshot.components) &&
          initialSnapshot.components.length > 0
        ) {
          // If snapshot components exist, initialize customComponents
          const initialDefs: OtdComponentDef[] = initialSnapshot.components.map(
            (c: any, idx: number) => {
              const matchedBase = data.components.find(
                (b) => b.id === c.id || (b.code === c.code && b.code),
              );
              return {
                id: c.id || Date.now() + idx,
                otd_id: data.otd.id,
                code: c.code || c.product_code || "",
                product_id: c.product_id || null,
                description: c.description || c.product_name || null,
                component_type:
                  c.component_type === "IMPROVEMENT" ? "IMPROVEMENT" : "BASIC",
                quantity_expression:
                  c.quantity_expression || String(c.quantity || 1),
                dimension_expressions:
                  c.dimension_expressions ||
                  matchedBase?.dimension_expressions ||
                  {},
                characteristic_id: c.characteristic_id || null,
                characteristic_expression: c.characteristic_expression || null,
                price_increment: Number(
                  c.price_increment ?? c.increment_amount ?? 0,
                ),
                price_increment_type:
                  c.price_increment_type === "PERCENTAGE"
                    ? "PERCENTAGE"
                    : "FIXED",
                active: c.active !== false,
                sort_order: idx,
                product: matchedBase?.product || null,
                dimensions: matchedBase?.dimensions || [],
                scales: matchedBase?.scales || [],
                characteristics: matchedBase?.characteristics || [],
              };
            },
          );
          setCustomComponents(initialDefs);
        } else {
          setCustomComponents(data.components);
        }
      })
      .catch((err) => {
        if (active) {
          console.error("Error al cargar OTD runtime:", err);
          setRuntimeError(
            err?.message || "Error al cargar el configurador OTD.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoadingRuntime(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isOpen, selectedOtdId]);

  // Effective runtime data with customized components
  const effectiveRuntimeData = useMemo<OtdRuntimeData | null>(() => {
    if (!runtimeData) return null;
    return {
      ...runtimeData,
      components: customComponents,
    };
  }, [runtimeData, customComponents]);

  // Live calculation with try-catch safety
  const calculation = useMemo<OtdCalculationResult | null>(() => {
    if (!effectiveRuntimeData) return null;
    try {
      return calculateOtdRuntime(effectiveRuntimeData, values);
    } catch (err: any) {
      console.error("Error calculando OTD runtime:", err);
      return {
        inputs: values,
        resolvedVariables: {},
        components: [],
        otdBasePrice: 0,
        otdScaleStepUsed: null,
        totalIncrements: 0,
        totalAmount: 0,
        isValid: false,
        requiredMissing: [],
        errors: [err?.message || "Error en el cálculo paramétrico"],
      };
    }
  }, [effectiveRuntimeData, values]);

  // Live snapshot
  const snapshot = useMemo<OtdConfigurationSnapshot | null>(() => {
    if (!effectiveRuntimeData || !calculation) return null;
    try {
      return buildOtdConfigurationSnapshot(effectiveRuntimeData, calculation);
    } catch {
      return null;
    }
  }, [effectiveRuntimeData, calculation]);

  const handleOpenAddNewComponent = () => {
    const newComp: OtdComponentDef = {
      id: Date.now(),
      otd_id: runtimeData?.otd.id || 0,
      code: "",
      product_id: null,
      description: "Nuevo Componente Extra",
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
  };

  const handleOpenEditComponent = (index: number) => {
    const comp = customComponents[index];
    setEditingCompModal({
      comp: { ...comp },
      index,
    });
  };

  const handleSaveComponentFromModal = () => {
    if (!editingCompModal) return;
    const { comp, index } = editingCompModal;

    if (!comp.product_id && !comp.code) {
      return;
    }

    if (index === null) {
      // Add new component
      setCustomComponents((prev) => [...prev, comp]);
    } else {
      // Update existing component
      setCustomComponents((prev) => {
        const next = [...prev];
        next[index] = comp;
        return next;
      });
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
  };

  const handleResetComponents = () => {
    if (!runtimeData) return;
    setCustomComponents(runtimeData.components);
  };

  if (!isOpen) return null;

  const handleValueChange = (code: string, val: string) => {
    setValues((prev) => ({
      ...prev,
      [code]: val,
    }));
  };

  const handleResetToDefaults = () => {
    if (!runtimeData) return;
    const defaults: Record<string, string> = {};
    for (const s of runtimeData.selections) {
      if (s.selection_type === "OPTION" && s.options.length > 0) {
        defaults[s.code] = s.options[0].value ?? s.options[0].code;
      } else {
        defaults[s.code] = "";
      }
    }
    setValues(defaults);
  };

  const handleConfirm = () => {
    if (!snapshot || !calculation || !calculation.isValid || !runtimeData)
      return;

    // Build dimension drafts
    const defaultWorkUnitSymbol =
      runtimeData?.workUnit?.symbol || runtimeData?.workUnit?.code || "";

    const dimDrafts: QuotationLineDimensionDraft[] = (
      snapshot.inputs_display || []
    )
      .filter(
        (i) =>
          i.is_dimension || (typeof i.value === "number" && !isNaN(i.value)),
      )
      .map((i, idx) => ({
        code: i.code,
        name: i.name,
        value:
          typeof i.value === "number"
            ? i.value
            : parseFloat(String(i.value)) || null,
        unit_id: i.unit_id ?? runtimeData?.workUnit?.id ?? null,
        unit_code: i.unit_code || runtimeData?.workUnit?.code || undefined,
        unit_symbol:
          i.unit_symbol || runtimeData?.workUnit?.symbol || undefined,
        sort_order: idx,
      }));

    const dimSummary =
      dimDrafts.length > 0
        ? dimDrafts
            .map((d) => {
              const u = d.unit_symbol || d.unit_code || defaultWorkUnitSymbol;
              return `${d.name}: ${d.value ?? 0}${u ? ` ${u}` : ""}`;
            })
            .join(" · ")
        : (snapshot.inputs_display || [])
            .filter((i) => i.value !== null)
            .map((i) => `${i.name}: ${i.display_value}`)
            .join(", ");

    const description = `${snapshot.otd_name} (${dimSummary || snapshot.otd_code})`;

    const enrichedSnapshot: OtdConfigurationSnapshot = {
      ...snapshot,
      dimensions: dimDrafts.map((d) => ({
        code: d.code,
        name: d.name,
        value: d.value,
        unit_id: d.unit_id ?? null,
        unit_code: d.unit_code || defaultWorkUnitSymbol || undefined,
        unit_symbol: d.unit_symbol || defaultWorkUnitSymbol || undefined,
      })),
      notes: notes || undefined,
    };

    onConfirm(enrichedSnapshot, {
      description,
      unitPrice: Number(snapshot.total_amount || 0),
      quantity: quantity > 0 ? quantity : 1,
      dimensions: dimDrafts,
      otdId: runtimeData.otd.id,
    });

    onClose();
  };

  return createPortal(
    <div
      className="quotation-configurator-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="quotation-configurator-container"
        style={{ maxWidth: "1140px", width: "96vw" }}
      >
        {/* Modal Header */}
        <header className="quotation-configurator-header">
          <div className="modal-title-group">
            <div
              className="modal-icon-badge"
              style={{ background: "#0284c7", color: "#ffffff" }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <h3>
                {runtimeData
                  ? `Configurador OTD: ${runtimeData.otd.name}`
                  : "Configurar Producto Técnico a Medida (OTD)"}
              </h3>
              <p>
                {runtimeData
                  ? `${runtimeData.otd.code} · ${runtimeData.otd.template_type || "Configurador paramétrico"} · Cálculo en tiempo real`
                  : "Selecciona una plantilla técnica para configurar las dimensiones, opciones y despiece."}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </header>

        {/* Modal Body */}
        <div
          className="quotation-configurator-body"
          style={{ maxHeight: "calc(85vh - 140px)", overflowY: "auto" }}
        >
          {/* STEP 1: OTD Selection if none selected */}
          {!selectedOtdId && (
            <OtdSelectionStep
              otdList={otdList}
              loadingOtdList={loadingOtdList}
              otdSearch={otdSearch}
              onSearchChange={setOtdSearch}
              onSelectOtd={(id) => setSelectedOtdId(id)}
            />
          )}

          {/* STEP 2: Interactive Parameter Configuration */}
          {selectedOtdId && loadingRuntime && (
            <div
              style={{ textAlign: "center", padding: "60px", color: "#64748b" }}
            >
              <Loader2
                size={32}
                className="animate-spin"
                style={{ margin: "0 auto 14px", color: "#0284c7" }}
              />
              <p style={{ fontSize: "15px" }}>
                Cargando motor de cálculo y parámetros del OTD…
              </p>
            </div>
          )}

          {selectedOtdId && runtimeError && (
            <div style={{ padding: "24px" }}>
              <div
                style={{
                  background: "#f4eae6",
                  border: "1px solid #fecaca",
                  borderRadius: "8px",
                  padding: "16px",
                  color: "#991b1b",
                  display: "flex",
                  gap: "10px",
                }}
              >
                <AlertCircle size={20} />
                <div>
                  <strong>Error de configuración:</strong>
                  <p style={{ margin: "4px 0 0", fontSize: "13px" }}>
                    {runtimeError}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedOtdId(null)}
                style={{ marginTop: "16px" }}
              >
                <ArrowLeft size={14} /> Seleccionar otro OTD
              </button>
            </div>
          )}

          {selectedOtdId && runtimeData && !loadingRuntime && calculation && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "minmax(320px, 1.05fr) minmax(360px, 1.25fr)",
                gap: "20px",
                padding: "20px",
              }}
            >
              {/* LEFT COLUMN: Input Parameters Form */}
              <OtdInputsForm
                runtimeData={runtimeData}
                values={values}
                quantity={quantity}
                notes={notes}
                onValueChange={handleValueChange}
                onQuantityChange={setQuantity}
                onNotesChange={setNotes}
              />

              {/* RIGHT COLUMN: Live Calculation & Breakdown */}
              <OtdBreakdownPanel
                calculation={calculation}
                runtimeData={runtimeData}
                customComponents={customComponents}
                quantity={quantity}
                onOpenAddNewComponent={handleOpenAddNewComponent}
                onOpenEditComponent={handleOpenEditComponent}
                onToggleComponentActive={handleToggleComponentActive}
                onRemoveComponent={handleRemoveComponent}
                onResetComponents={handleResetComponents}
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="quotation-configurator-footer">
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {selectedOtdId && (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSelectedOtdId(null)}
                  title="Elegir otro OTD"
                >
                  <ArrowLeft size={14} /> Cambiar OTD
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleResetToDefaults}
                  title="Restablecer a valores por defecto"
                >
                  <RefreshCw size={14} /> Valores por defecto
                </button>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
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
              disabled={!selectedOtdId || !calculation?.isValid}
              onClick={handleConfirm}
              style={{
                background: calculation?.isValid ? "#0284c7" : "#94a3b8",
                borderColor: calculation?.isValid ? "#0284c7" : "#94a3b8",
              }}
            >
              <CheckCircle2 size={16} />
              {lineIndex !== null
                ? "Actualizar Línea de Presupuesto"
                : "Insertar en Presupuesto"}
            </button>
          </div>
        </footer>
      </div>

      {/* NESTED MODAL: Add / Edit Component for this OTD Line */}
      {editingCompModal && (
        <OtdComponentEditModal
          editingCompModal={editingCompModal}
          onClose={() => setEditingCompModal(null)}
          onSave={handleSaveComponentFromModal}
          onUpdateComp={(updatedComp) =>
            setEditingCompModal({
              ...editingCompModal,
              comp: updatedComp,
            })
          }
          selections={runtimeData?.selections || []}
          variables={runtimeData?.variables || []}
          workUnitSymbol={
            runtimeData?.workUnit?.symbol ||
            runtimeData?.workUnit?.code ||
            "mm"
          }
        />
      )}
    </div>,
    document.body,
  );
}
