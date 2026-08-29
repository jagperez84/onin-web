import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Unit } from "../../../services/catalog/unitRepository";
import type { Otd, Selection, SelectionOption } from "./types";

export type OtdSelectionsSectionProps = {
  selections: Selection[];
  otd: Otd;
  units: Unit[];
  onChange: (updated: Selection[]) => void;
};

export function OtdSelectionsSection({
  selections,
  otd,
  units,
  onChange,
}: OtdSelectionsSectionProps) {
  const emptySelection = (): Selection => ({
    code: "",
    name: "",
    selection_type: "OPTION",
    required: true,
    is_dimension: false,
    unit_id: null,
    options: [],
    sort_order: selections.length,
  });

  const emptyOption = (s: Selection): SelectionOption => ({
    code: "",
    label: "",
    value: null,
    sort_order: s.options.length,
  });

  const addSelection = () => {
    onChange([...selections, emptySelection()]);
  };

  const removeSelection = (index: number) => {
    onChange(selections.filter((_, i) => i !== index));
  };

  const updateSelection = (index: number, partial: Partial<Selection>) => {
    const next = [...selections];
    next[index] = { ...next[index], ...partial };
    onChange(next);
  };

  return (
    <section id="sec-entradas" className="otd-card otd-section-anchor">
      <div className="otd-card-head">
        <div>
          <h2>2. Entradas para oficina</h2>
          <p>
            Parámetros que el usuario de ventas / presupuestos introducirá.
            Marca las que son dimensiones para el escalado.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={addSelection}
        >
          <Plus size={15} /> Añadir entrada
        </button>
      </div>

      {selections.length === 0 ? (
        <div className="otd-empty">
          Todavía no hay entradas de oficina definidas.
        </div>
      ) : (
        selections.map((s, si) => (
          <div className="otd-row-card" key={si}>
            <div className="otd-row-actions">
              <span className="row-tag">
                <strong>
                  {si + 1}. Entrada: {s.code || "Sin código"}
                </strong>{" "}
                {s.is_dimension && (
                  <span className="dimension-badge">DIMENSIÓN ESCALADO</span>
                )}
              </span>
              <button
                type="button"
                className="icon-btn danger"
                title="Eliminar entrada"
                onClick={() => removeSelection(si)}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="otd-grid five">
              <label>
                Código (variable) *
                <input
                  value={s.code}
                  onChange={(e) =>
                    updateSelection(si, {
                      code: e.target.value.toUpperCase().replace(/\s+/g, "_"),
                    })
                  }
                  placeholder="Ej. ANCHO"
                />
              </label>
              <label>
                Nombre visible
                <input
                  value={s.name}
                  onChange={(e) => updateSelection(si, { name: e.target.value })}
                  placeholder="Ej. Ancho"
                />
              </label>
              <label>
                Tipo
                <select
                  value={s.selection_type}
                  onChange={(e) =>
                    updateSelection(si, {
                      selection_type: e.target
                        .value as Selection["selection_type"],
                    })
                  }
                >
                  <option value="NUMBER">NUMBER (Numérico/Medida)</option>
                  <option value="OPTION">OPTION (Lista desplegable)</option>
                  <option value="TEXT">TEXT (Texto libre)</option>
                  <option value="BOOLEAN">BOOLEAN (Sí/No)</option>
                </select>
              </label>
              <label>
                Unidad
                <select
                  value={s.unit_id ?? ""}
                  onChange={(e) =>
                    updateSelection(si, {
                      unit_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">
                    {s.is_dimension
                      ? `Heredar (${units.find((u) => u.id === otd.work_unit_id)?.symbol || "mm"})`
                      : "Sin unidad (ud)"}
                  </option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.symbol || u.code})
                    </option>
                  ))}
                </select>
              </label>
              <div className="checks-group">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.required}
                    onChange={(e) =>
                      updateSelection(si, { required: e.target.checked })
                    }
                  />{" "}
                  Obligatorio
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={s.is_dimension}
                    onChange={(e) =>
                      updateSelection(si, { is_dimension: e.target.checked })
                    }
                  />{" "}
                  Es dimensión
                </label>
              </div>
            </div>

            {s.selection_type === "OPTION" && (
              <div className="otd-options-subcard">
                <div className="otd-options-subhead">
                  <strong>
                    Opciones de la lista desplegable ({s.options.length})
                  </strong>
                  <button
                    type="button"
                    className="secondary-button small"
                    onClick={() => {
                      const updatedOptions = [...s.options, emptyOption(s)];
                      updateSelection(si, { options: updatedOptions });
                    }}
                  >
                    <Plus size={13} /> Añadir opción
                  </button>
                </div>

                {s.options.length > 0 && (
                  <div className="otd-options-header-row">
                    <span>Nombre visible</span>
                    <span>Valor numérico / técnico</span>
                    <span></span>
                  </div>
                )}

                {s.options.map((o, oi) => (
                  <div className="otd-option-row" key={o.id ?? oi}>
                    <input
                      placeholder="Nombre visible (ej. No, Sí, Motor 50Nm, Blanco...)"
                      value={o.label}
                      onChange={(e) => {
                        const newLabel = e.target.value;
                        const updatedOptions = s.options.map((item, i) => {
                          if (i !== oi) return item;
                          return {
                            ...item,
                            label: newLabel,
                            code:
                              !item.value && !item.code
                                ? newLabel.toUpperCase().replace(/\s+/g, "_")
                                : item.code,
                          };
                        });
                        updateSelection(si, { options: updatedOptions });
                      }}
                    />
                    <input
                      placeholder="Valor numérico (ej. 0, 1, 50, RAL9010...)"
                      value={o.value ?? o.code ?? ""}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        const updatedOptions = s.options.map((item, i) => {
                          if (i !== oi) return item;
                          return {
                            ...item,
                            value: newVal,
                            code:
                              newVal ||
                              item.label.toUpperCase().replace(/\s+/g, "_"),
                          };
                        });
                        updateSelection(si, { options: updatedOptions });
                      }}
                    />
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Eliminar opción"
                      onClick={() => {
                        const updatedOptions = s.options.filter(
                          (_, i) => i !== oi,
                        );
                        updateSelection(si, { options: updatedOptions });
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}
