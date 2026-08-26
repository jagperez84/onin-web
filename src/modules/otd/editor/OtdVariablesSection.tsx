import React from "react";
import { Plus, Trash2, WandSparkles } from "lucide-react";
import { FormulaPredictiveInput } from "../FormulaPredictiveInput";
import type { Selection, Variable } from "./types";

export type OtdVariablesSectionProps = {
  variables: Variable[];
  selections: Selection[];
  naturalRule: string;
  onNaturalRuleChange: (val: string) => void;
  onChange: (updated: Variable[]) => void;
};

export function OtdVariablesSection({
  variables,
  selections,
  naturalRule,
  onNaturalRuleChange,
  onChange,
}: OtdVariablesSectionProps) {
  const emptyVariable = (): Variable => ({
    code: "",
    name: "",
    expression: "",
    data_type: "NUMBER",
    active: true,
    sort_order: variables.length,
  });

  const addVariable = () => {
    onChange([...variables, emptyVariable()]);
  };

  const removeVariable = (index: number) => {
    onChange(variables.filter((_, i) => i !== index));
  };

  const updateVariable = (index: number, partial: Partial<Variable>) => {
    const next = [...variables];
    next[index] = { ...next[index], ...partial };
    onChange(next);
  };

  return (
    <section id="sec-formulacion" className="otd-card otd-section-anchor">
      <div className="otd-card-head">
        <div>
          <h2>4. Formulación y Variables Calculadas</h2>
          <p>
            El técnico define las variables y fórmulas intermedias; la oficina no
            necesita conocerlas.
          </p>
        </div>
        <span className="ai-badge">
          <WandSparkles size={14} /> Fórmulas Aritméticas
        </span>
      </div>

      <label>
        Regla o notas de cálculo en lenguaje natural
        <textarea
          value={naturalRule}
          onChange={(e) => onNaturalRuleChange(e.target.value)}
          placeholder="Ejemplo: si el ancho supera 4000 mm, añadir un soporte central adicional; la superficie de lona es (ANCHO * SALIDA) / 1000000."
        />
      </label>

      <div className="hint">
        Variables disponibles:{" "}
        {variables
          .filter((v) => v.code)
          .map((v) => v.code)
          .join(", ") || "todavía no definidas"}
        .
      </div>

      {variables.map((v, vi) => (
        <div className="otd-rule-line-container" key={vi}>
          <div className="otd-rule-line">
            <input
              placeholder="Código (ej. SUPERFICIE)"
              value={v.code}
              onChange={(e) =>
                updateVariable(vi, {
                  code: e.target.value.toUpperCase().replace(/\s+/g, "_"),
                })
              }
            />
            <input
              placeholder="Nombre descriptivo"
              value={v.name}
              onChange={(e) => updateVariable(vi, { name: e.target.value })}
            />
            <div className="wide">
              <FormulaPredictiveInput
                value={v.expression ?? ""}
                onChange={(val) => updateVariable(vi, { expression: val })}
                placeholder="Expresión técnica (ej. ANCHO * SALIDA / 1000000)"
                availableInputs={selections}
                availableVariables={variables.filter((_, i) => i !== vi)}
                compact
              />
            </div>
            <button
              type="button"
              className="icon-btn danger"
              title="Eliminar variable"
              onClick={() => removeVariable(vi)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="secondary-btn"
        onClick={addVariable}
      >
        <Plus size={15} /> Añadir variable calculada
      </button>
    </section>
  );
}
