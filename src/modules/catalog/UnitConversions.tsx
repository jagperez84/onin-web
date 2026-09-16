import { useEffect, useState } from "react";
import { Edit3, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import { EntitySearchField } from "../../components/ui/EntitySearchField";
import { listUnits, type Unit } from "../../services/catalog/unitRepository";
import {
  listAllUnitConversions,
  upsertUnitConversion,
  deleteUnitConversion,
  type UnitConversion,
} from "../../services/catalog/unitConversionRepository";
import { CoreRepositoryError } from "../../services/core/coreRepository";

type FormState = {
  id?: number;
  from_unit_id: number | null;
  to_unit_id: number | null;
  factor: number;
  offset_val: number;
  active: boolean;
};
const emptyForm: FormState = {
  from_unit_id: null,
  to_unit_id: null,
  factor: 1,
  offset_val: 0,
  active: true,
};

export function UnitConversions() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [rows, setRows] = useState<UnitConversion[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const unitOptions = units.map((u) => ({
    id: u.id,
    code: u.code,
    label: `${u.code} · ${u.name}`,
  }));
  const unitLabel = (id: number) => {
    const u = units.find((x) => x.id === id);
    return u ? `${u.code} · ${u.name}` : `#${id}`;
  };

  useEffect(() => {
    getActiveCompanies()
      .then((cs) => setCompanyId(cs[0]?.id ?? null))
      .catch((e) =>
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo obtener la empresa activa.",
        ),
      );
  }, []);

  useEffect(() => {
    if (companyId) void load();
  }, [companyId]);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      const [u, c] = await Promise.all([
        listUnits(companyId),
        listAllUnitConversions(companyId),
      ]);
      setUnits(u);
      setRows(c);
    } catch (e) {
      setError(
        e instanceof CoreRepositoryError
          ? e.message
          : "No se pudieron cargar las conversiones.",
      );
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setForm({ ...emptyForm });
    setEditing(true);
    setError("");
  }

  function startEdit(row: UnitConversion) {
    setForm({
      id: row.id,
      from_unit_id: row.from_unit_id,
      to_unit_id: row.to_unit_id,
      factor: row.factor,
      offset_val: row.offset_val,
      active: row.active,
    });
    setEditing(true);
    setError("");
  }

  async function save() {
    if (!companyId) return;
    if (!form.from_unit_id || !form.to_unit_id) {
      setError("Selecciona la unidad de origen y la de destino.");
      return;
    }
    if (!(form.factor > 0)) {
      setError("El factor debe ser mayor que cero.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await upsertUnitConversion(companyId, {
        id: form.id,
        from_unit_id: form.from_unit_id,
        to_unit_id: form.to_unit_id,
        factor: form.factor,
        offset_val: form.offset_val,
        active: form.active,
      });
      setEditing(false);
      await load();
    } catch (e) {
      setError(
        e instanceof CoreRepositoryError
          ? e.message
          : "No se pudo guardar la conversión.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(row: UnitConversion) {
    const ok = await confirmDialog({
      title: "¿Eliminar esta conversión?",
      message: `Se eliminará la conversión de ${unitLabel(row.from_unit_id)} a ${unitLabel(row.to_unit_id)}.`,
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteUnitConversion(row.id);
      await load();
    } catch (e) {
      setError(
        e instanceof CoreRepositoryError
          ? e.message
          : "No se pudo eliminar la conversión.",
      );
    }
  }

  return (
    <div className={`catalog-layout ${editing ? "has-editor" : ""}`}>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Conversiones entre unidades</h2>
            <p>
              Factor y desplazamiento que usa el sistema para convertir una
              medida de una unidad a otra (p. ej. en la configuración de
              productos OTD). Fórmula: destino = origen × factor +
              desplazamiento.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button className="secondary-button" onClick={load}>
              <RotateCcw size={15} /> Actualizar
            </button>
            <button className="primary-button" onClick={startNew}>
              <Plus size={16} /> Nueva conversión
            </button>
          </div>
        </div>

        {error && <div className="inline-error">{error}</div>}

        {loading ? (
          <div className="loading-block">Cargando…</div>
        ) : (
          <div className="table-panel">
            <table>
              <thead>
                <tr>
                  <th>Desde</th>
                  <th>Hacia</th>
                  <th>Factor</th>
                  <th>Desplazamiento</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{unitLabel(r.from_unit_id)}</td>
                    <td>{unitLabel(r.to_unit_id)}</td>
                    <td>{r.factor}</td>
                    <td>{r.offset_val}</td>
                    <td>
                      <span
                        className={`status ${r.active ? "active" : "inactive"}`}
                      >
                        {r.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <div className="item-actions">
                        <button
                          className="icon-action"
                          title="Editar"
                          onClick={() => startEdit(r)}
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          className="icon-action danger"
                          title="Eliminar"
                          onClick={() => removeRow(r)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      No hay conversiones configuradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <aside className="panel catalog-editor">
          <div className="panel-head">
            <div>
              <h2>{form.id ? "Editar" : "Nueva"} conversión</h2>
            </div>
            <button
              className="icon-action"
              onClick={() => setEditing(false)}
              title="Cancelar"
            >
              <X size={17} />
            </button>
          </div>
          <div className="form-grid">
            <EntitySearchField
              label="Desde (origen)"
              required
              matchExactCode
              options={unitOptions}
              value={
                unitOptions.find((u) => u.id === form.from_unit_id) ?? null
              }
              onChange={(opt) =>
                setForm({ ...form, from_unit_id: (opt?.id as number) ?? null })
              }
              placeholder="Unidad de origen…"
            />
            <EntitySearchField
              label="Hacia (destino)"
              required
              matchExactCode
              options={unitOptions}
              value={unitOptions.find((u) => u.id === form.to_unit_id) ?? null}
              onChange={(opt) =>
                setForm({ ...form, to_unit_id: (opt?.id as number) ?? null })
              }
              placeholder="Unidad de destino…"
            />
            <label>
              Factor
              <input
                type="number"
                step="any"
                value={form.factor}
                onChange={(e) =>
                  setForm({ ...form, factor: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Desplazamiento
              <input
                type="number"
                step="any"
                value={form.offset_val}
                onChange={(e) =>
                  setForm({ ...form, offset_val: Number(e.target.value) })
                }
              />
            </label>
            <p className="form-help wide">
              1 unidad de origen equivale a {form.factor || 0} unidad(es) de
              destino{form.offset_val ? ` + ${form.offset_val}` : ""}. Registra
              también la conversión inversa si se va a usar en ambos sentidos.
            </p>
            <label>
              Estado
              <select
                value={form.active ? "1" : "0"}
                onChange={(e) =>
                  setForm({ ...form, active: e.target.value === "1" })
                }
              >
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </label>
          </div>
          <div className="actions">
            <button
              className="secondary-button"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
            <button className="primary-button" disabled={saving} onClick={save}>
              <Save size={15} /> {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
