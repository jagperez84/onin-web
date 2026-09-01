import React, { useEffect, useMemo, useState } from "react";
import { WandSparkles, X, Loader2, AlertTriangle, Sparkles } from "lucide-react";
import { validateFormulaReferences } from "../../../services/otd/formulaEngine";
import { proposeOtdDraft, type OtdAssistantProposal } from "../../../services/otd/otdAssistantService";
import type { Unit } from "../../../services/catalog/unitRepository";
import type { Component, Selection, Variable } from "./types";

export type OtdAssistantModalProps = {
  units: Unit[];
  selections: Selection[];
  variables: Variable[];
  components: Component[];
  onClose: () => void;
  onAccept: (result: {
    selections: Selection[];
    variables: Variable[];
    components: Component[];
  }) => void;
};

type ItemValidity = { valid: boolean; error?: string };

export function OtdAssistantModal({
  units,
  selections,
  variables,
  components,
  onClose,
  onAccept,
}: OtdAssistantModalProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<OtdAssistantProposal | null>(null);

  const [checkedSelections, setCheckedSelections] = useState<Set<number>>(new Set());
  const [checkedVariables, setCheckedVariables] = useState<Set<number>>(new Set());
  const [checkedComponents, setCheckedComponents] = useState<Set<number>>(new Set());

  const existingCodes = useMemo(
    () => new Set([...selections.map((s) => s.code), ...variables.map((v) => v.code)].filter(Boolean)),
    [selections, variables],
  );

  const knownCodes = useMemo(() => {
    if (!proposal) return existingCodes;
    return new Set([
      ...existingCodes,
      ...proposal.selections.map((s) => s.code).filter(Boolean),
      ...proposal.variables.map((v) => v.code).filter(Boolean),
    ]);
  }, [proposal, existingCodes]);

  const validity = useMemo(() => {
    if (!proposal) return null;
    const seen = new Set<string>();

    const codeValidity = (code: string | undefined): ItemValidity | null => {
      const trimmed = (code || "").trim();
      if (!trimmed) return { valid: false, error: "Falta el código." };
      if (existingCodes.has(trimmed)) {
        return { valid: false, error: `Ya existe una entrada o variable con el código '${trimmed}' en el OTD.` };
      }
      if (seen.has(trimmed)) {
        return { valid: false, error: `Código '${trimmed}' duplicado dentro de la propuesta.` };
      }
      seen.add(trimmed);
      return null;
    };

    const selectionResults: ItemValidity[] = proposal.selections.map((s) => {
      const codeIssue = codeValidity(s.code);
      if (codeIssue) return codeIssue;
      return { valid: true };
    });

    const variableResults: ItemValidity[] = proposal.variables.map((v) => {
      const codeIssue = codeValidity(v.code);
      if (codeIssue) return codeIssue;
      try {
        validateFormulaReferences(v.expression, knownCodes);
      } catch (e) {
        return { valid: false, error: e instanceof Error ? e.message : "Fórmula no válida." };
      }
      return { valid: true };
    });

    const componentResults: ItemValidity[] = proposal.components.map((c) => {
      if (!c.quantity_expression?.trim()) {
        return { valid: false, error: "Falta la fórmula de cantidad." };
      }
      try {
        validateFormulaReferences(c.quantity_expression, knownCodes);
        for (const expr of Object.values(c.dimension_expressions ?? {})) {
          validateFormulaReferences(expr, knownCodes);
        }
      } catch (e) {
        return { valid: false, error: e instanceof Error ? e.message : "Fórmula no válida." };
      }
      return { valid: true };
    });

    return { selections: selectionResults, variables: variableResults, components: componentResults };
  }, [proposal, existingCodes, knownCodes]);

  useEffect(() => {
    if (!proposal || !validity) return;
    setCheckedSelections(new Set(validity.selections.flatMap((v, i) => (v.valid ? [i] : []))));
    setCheckedVariables(new Set(validity.variables.flatMap((v, i) => (v.valid ? [i] : []))));
    setCheckedComponents(new Set(validity.components.flatMap((v, i) => (v.valid ? [i] : []))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal]);

  const toggle = (set: Set<number>, setFn: (s: Set<number>) => void, index: number, canToggle: boolean) => {
    if (!canToggle) return;
    const next = new Set(set);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setFn(next);
  };

  const resolveUnitId = (code?: string | null): number | null => {
    if (!code) return null;
    return units.find((u) => u.code === code)?.id ?? null;
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    setProposal(null);
    try {
      const result = await proposeOtdDraft({
        prompt: prompt.trim(),
        unitCodes: units.map((u) => u.code),
        existingSelections: selections.map((s) => ({ code: s.code })),
        existingVariables: variables.map((v) => ({ code: v.code })),
      });
      setProposal(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo generar la propuesta.");
    } finally {
      setLoading(false);
    }
  };

  const totalAccepted = checkedSelections.size + checkedVariables.size + checkedComponents.size;

  const handleAccept = () => {
    if (!proposal) return;

    const acceptedSelections: Selection[] = proposal.selections
      .filter((_, i) => checkedSelections.has(i))
      .map((draft, idx) => ({
        code: draft.code,
        name: draft.name || draft.code,
        selection_type: draft.selection_type,
        required: draft.required,
        is_dimension: draft.is_dimension,
        unit_id: resolveUnitId(draft.unit_code),
        options:
          draft.selection_type === "OPTION"
            ? (draft.options ?? []).map((o, oi) => ({ code: o.code, label: o.label, value: null, sort_order: oi }))
            : [],
        sort_order: selections.length + idx,
      }));

    const acceptedVariables: Variable[] = proposal.variables
      .filter((_, i) => checkedVariables.has(i))
      .map((draft, idx) => ({
        code: draft.code,
        name: draft.name || draft.code,
        expression: draft.expression,
        data_type: draft.data_type || "NUMBER",
        sort_order: variables.length + idx,
        active: true,
      }));

    const acceptedComponents: Component[] = proposal.components
      .filter((_, i) => checkedComponents.has(i))
      .map((draft, idx) => ({
        product_id: null,
        characteristic_id: null,
        characteristic_expression: null,
        code: draft.code,
        description: draft.description,
        quantity_expression: draft.quantity_expression,
        component_type: draft.component_type,
        price_increment: 0,
        price_increment_type: "FIXED",
        unit_id: resolveUnitId(draft.unit_code),
        active: true,
        sort_order: components.length + idx,
        dimension_expressions: draft.dimension_expressions ?? {},
      }));

    onAccept({ selections: acceptedSelections, variables: acceptedVariables, components: acceptedComponents });
    onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card lg">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon-badge primary">
              <WandSparkles size={18} />
            </span>
            <div>
              <h2>Asistente IA del OTD</h2>
              <p>
                Describe qué necesitas y el asistente propondrá entradas de oficina,
                variables y componentes. Revisa y decide qué añadir.
              </p>
            </div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} title="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label>Petición</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ej. Toldo capota con brazo articulado motorizado, entradas de ancho, salida y color de lona, y componentes de tela, brazo y motor."
              disabled={loading}
            />
          </div>

          <button
            type="button"
            className="primary-button"
            onClick={() => void handleGenerate()}
            disabled={loading || !prompt.trim()}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? "Generando…" : "Generar propuesta"}
          </button>

          {error && <div className="otd-message error">{error}</div>}

          {proposal && (
            <div className="otd-assistant-results">
              {proposal.notes && <div className="hint">{proposal.notes}</div>}

              <OtdAssistantList
                title={`Entradas de oficina propuestas (${proposal.selections.length})`}
                emptyLabel="El asistente no ha propuesto entradas nuevas."
                items={proposal.selections.map((s, i) => ({
                  key: `sel-${i}`,
                  title: `${s.code || "?"} — ${s.name || "sin nombre"}`,
                  detail: `${s.selection_type}${s.required ? " · obligatorio" : ""}${s.is_dimension ? " · dimensión" : ""}${s.unit_code ? ` · ${s.unit_code}` : ""}`,
                  checked: checkedSelections.has(i),
                  validity: validity?.selections[i],
                  onToggle: () =>
                    toggle(checkedSelections, setCheckedSelections, i, Boolean(validity?.selections[i]?.valid)),
                }))}
              />

              <OtdAssistantList
                title={`Variables propuestas (${proposal.variables.length})`}
                emptyLabel="El asistente no ha propuesto variables nuevas."
                items={proposal.variables.map((v, i) => ({
                  key: `var-${i}`,
                  title: `${v.code || "?"} — ${v.name || "sin nombre"}`,
                  detail: v.expression || "",
                  checked: checkedVariables.has(i),
                  validity: validity?.variables[i],
                  onToggle: () =>
                    toggle(checkedVariables, setCheckedVariables, i, Boolean(validity?.variables[i]?.valid)),
                }))}
              />

              <OtdAssistantList
                title={`Componentes propuestos (${proposal.components.length})`}
                emptyLabel="El asistente no ha propuesto componentes nuevos."
                items={proposal.components.map((c, i) => ({
                  key: `comp-${i}`,
                  title: `${c.code || "?"} — ${c.description || "sin descripción"}`,
                  detail: `${c.component_type === "IMPROVEMENT" ? "Mejora" : "Básico"} · cantidad: ${c.quantity_expression}`,
                  checked: checkedComponents.has(i),
                  validity: validity?.components[i],
                  onToggle: () =>
                    toggle(checkedComponents, setCheckedComponents, i, Boolean(validity?.components[i]?.valid)),
                }))}
              />
            </div>
          )}
        </div>

        <div className="modal-actions-footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={handleAccept}
            disabled={!proposal || totalAccepted === 0}
          >
            Añadir seleccionados{totalAccepted > 0 ? ` (${totalAccepted})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

type OtdAssistantListItem = {
  key: string;
  title: string;
  detail: string;
  checked: boolean;
  validity?: ItemValidity;
  onToggle: () => void;
};

function OtdAssistantList({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: OtdAssistantListItem[];
}) {
  return (
    <div className="otd-assistant-group">
      <strong className="otd-assistant-group-title">{title}</strong>
      {items.length === 0 ? (
        <div className="otd-empty">{emptyLabel}</div>
      ) : (
        <ul className="otd-assistant-list">
          {items.map((item) => (
            <li
              key={item.key}
              className={`otd-assistant-item ${item.validity && !item.validity.valid ? "invalid" : ""}`}
            >
              <label className="otd-assistant-item-check">
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={Boolean(item.validity && !item.validity.valid)}
                  onChange={item.onToggle}
                />
                <div>
                  <span className="otd-assistant-item-title">{item.title}</span>
                  {item.detail && <span className="otd-assistant-item-detail">{item.detail}</span>}
                  {item.validity && !item.validity.valid && (
                    <span className="otd-assistant-item-error">
                      <AlertTriangle size={12} /> {item.validity.error}
                    </span>
                  )}
                </div>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
