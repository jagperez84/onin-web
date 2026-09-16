import React from "react";
import type { Unit } from "../../../services/catalog/unitRepository";
import type { Otd } from "./types";

export type OtdIdentificationSectionProps = {
  otd: Otd;
  units: Unit[];
  onChange: (updated: Otd) => void;
};

export function OtdIdentificationSection({
  otd,
  units,
  onChange,
}: OtdIdentificationSectionProps) {
  return (
    <section id="sec-identificacion" className="otd-card otd-section-anchor">
      <div className="otd-card-head">
        <div>
          <h2>1. Identificación</h2>
          <p>Definición y datos maestros del artículo compuesto.</p>
        </div>
      </div>
      <div className="otd-grid three">
        <label>
          Código *
          <input
            value={otd.code}
            onChange={(e) => onChange({ ...otd, code: e.target.value })}
            placeholder="Ej. TOLDO_STOR"
          />
        </label>
        <label>
          Nombre del Producto *
          <input
            value={otd.name}
            onChange={(e) => onChange({ ...otd, name: e.target.value })}
            placeholder="Ej. Toldo Stor a Medida"
          />
        </label>
        <label>
          Unidad de Trabajo del OTD
          <select
            value={otd.work_unit_id ?? ""}
            onChange={(e) =>
              onChange({
                ...otd,
                work_unit_id: e.target.value ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">Milímetros (mm) — Por defecto</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.symbol || u.code})
                {u.magnitude ? ` · [${u.magnitude}]` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
