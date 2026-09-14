import { useEffect, useState } from "react";
import { Edit3, Plus, Save } from "lucide-react";
import {
  listColors,
  createColor,
  updateColor,
  setColorActive,
  type Color,
} from "../../services/catalog/colorRepository";
import { getActiveCompanies } from "../../services/core/coreRepository";
import { confirmDialog } from "../../components/ui/ConfirmDialog";

const emptyForm = { code: "", name: "", active: true };
type FormState = typeof emptyForm;

export function Colors() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<Color[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getActiveCompanies()
      .then((cs) => setCompanyId(cs[0]?.id ?? null))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudo obtener la empresa activa."),
      );
  }, []);
  useEffect(() => {
    if (companyId) load();
  }, [companyId]);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      setRows(await listColors(companyId, true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los colores.");
    } finally {
      setLoading(false);
    }
  }

  function edit(row: Color) {
    setEditing(row.id);
    setForm({ code: row.code, name: row.name, active: row.active });
    setError("");
  }
  function cancel() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
  }

  async function save() {
    if (!companyId) return;
    if (!form.code.trim() || !form.name.trim()) {
      setError("Código y nombre son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, code: form.code.trim(), name: form.name.trim() };
      if (editing === 0) await createColor(companyId, payload);
      else if (editing !== null) await updateColor(editing, payload);
      cancel();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el color.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: Color) {
    if (
      row.active &&
      !(await confirmDialog({
        title: `¿Desactivar el color ${row.name}?`,
        message: "Dejará de estar disponible para asociarse a nuevas características.",
        danger: true,
      }))
    )
      return;
    try {
      await setColorActive(row.id, !row.active);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado del color.");
    }
  }

  if (loading) return <div className="loading-block">Cargando colores…</div>;
  return (
    <div className="module-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">CONFIGURACIÓN / CATÁLOGO</div>
          <h1>Colores</h1>
          <p>
            Catálogo de colores. Cada color se asocia a una o varias características desde la ficha
            del artículo; todos los colores de una misma característica comparten su escalado de precio.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={() => {
            setEditing(0);
            setForm(emptyForm);
            setError("");
          }}
        >
          <Plus size={16} /> Añadir color
        </button>
      </div>
      {error && <div className="inline-error">{error}</div>}
      {editing !== null && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>{editing === 0 ? "Nuevo color" : "Editar color"}</h2>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Código *
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </label>
            <label>
              Nombre *
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Estado
              <select
                value={form.active ? "1" : "0"}
                onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}
              >
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </label>
          </div>
          <div className="actions">
            <button type="button" className="secondary-button" onClick={cancel}>
              Cancelar
            </button>
            <button type="button" className="primary-button" disabled={saving} onClick={save}>
              <Save size={15} />
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </section>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Colores</h2>
          </div>
          <span className="result-count">{rows.length} registros</span>
        </div>
        <div className="table-panel">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">No hay colores definidos.</div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.code}</td>
                    <td>{row.name}</td>
                    <td>
                      <span className={`status ${row.active ? "active" : "inactive"}`}>
                        {row.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <div className="item-actions">
                        <button className="icon-action" title="Editar" onClick={() => edit(row)}>
                          <Edit3 size={15} />
                        </button>
                        <button
                          className="icon-action"
                          title={row.active ? "Desactivar" : "Activar"}
                          onClick={() => toggleActive(row)}
                        >
                          {row.active ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
