import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { OtdScaleRow } from "../../../services/otd/otdScaleRepository";

export type OtdScalesSectionProps = {
  scales: OtdScaleRow[];
  unitSymbol: string;
  onChange: (scales: OtdScaleRow[]) => void;
};

export function OtdScalesSection({
  scales,
  unitSymbol,
  onChange,
}: OtdScalesSectionProps) {
  const addScaleRow = () => {
    const nextRow: OtdScaleRow = {
      id: Date.now(),
      otd_id: 0,
      dimension_1: 0,
      dimension_2: null,
      price: 0,
      dimension_values: [0],
      attribute_values: {},
    };
    onChange([...scales, nextRow]);
  };

  const updateScaleRow = (index: number, partial: Partial<OtdScaleRow>) => {
    const next = [...scales];
    next[index] = { ...next[index], ...partial };
    onChange(next);
  };

  const removeScaleRow = (index: number) => {
    onChange(scales.filter((_, i) => i !== index));
  };

  return (
    <section id="sec-escalado" className="otd-card otd-section-anchor">
      <div className="otd-card-head">
        <div>
          <h2>3. Matriz de Escalado Base del OTD</h2>
          <p>
            El OTD tiene su propio escalado que determina el precio base del
            producto compuesto. Si un componente básico no tiene incremento de
            precio, no modificará este precio base.
          </p>
        </div>
        <div className="scale-head-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={addScaleRow}
          >
            <Plus size={15} /> Añadir Fila
          </button>
        </div>
      </div>

      {scales.length === 0 ? (
        <div className="otd-empty">
          No hay tarifas de escalado base definidas. Pulsa en 'Añadir Fila' para
          crear las tarifas.
        </div>
      ) : (
        <div className="otd-scale-table-wrap">
          <table className="otd-scale-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Dimensión 1 (Hasta {unitSymbol})</th>
                <th>Dimensión 2 (Hasta {unitSymbol})</th>
                <th>Precio Base (€)</th>
                <th style={{ width: "48px" }}></th>
              </tr>
            </thead>
            <tbody>
              {scales.map((sc, sci) => (
                <tr key={sc.id || sci}>
                  <td>{sci + 1}</td>
                  <td>
                    <input
                      type="number"
                      value={sc.dimension_1}
                      onChange={(e) =>
                        updateScaleRow(sci, {
                          dimension_1: Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={sc.dimension_2 ?? ""}
                      placeholder="Opcional"
                      onChange={(e) =>
                        updateScaleRow(sci, {
                          dimension_2: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={sc.price}
                      onChange={(e) =>
                        updateScaleRow(sci, {
                          price: Number(e.target.value),
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-btn danger"
                      title="Eliminar fila de escalado"
                      onClick={() => removeScaleRow(sci)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
