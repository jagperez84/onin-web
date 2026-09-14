import { useEffect, useState } from "react";
import { Edit3, Plus, RotateCcw, Save, Search, Trash2, Undo2, Wrench, X } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import {
  listCatalog,
  markCatalogForDeletion,
  restoreCatalog,
  upsertCatalog,
  type CatalogRow,
} from "../../services/catalog/catalogRepository";
import "./catalog.css";

const KIND = "mountingTypes" as const;

type FormState = { id?: number; code: string; name: string; active: boolean };
const emptyForm: FormState = { code: "", name: "", active: true };

export function MountingTypes() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"active" | "inactive" | "deleted" | "all">("active");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getActiveCompanies()
      .then((cs) => setCompanyId(cs[0]?.id ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo obtener la empresa activa."));
  }, []);

  useEffect(() => {
    if (companyId) void load();
  }, [companyId, state]);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      setRows(await listCatalog(KIND, companyId, search, state));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }

  function startNew() {
    setForm({ ...emptyForm });
    setEditing(true);
    setError("");
  }

  function startEdit(r: CatalogRow) {
    setForm({ id: r.id, code: r.code, name: r.name, active: r.active });
    setEditing(true);
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
      await upsertCatalog(KIND, companyId, form);
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(id: number) {
    if (
      !(await confirmDialog({
        title: "¿Marcar este tipo de montaje para borrado?",
        message: "No se eliminará físicamente y podrá recuperarse.",
        danger: true,
      }))
    )
      return;
    try {
      await markCatalogForDeletion(KIND, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar para borrado.");
    }
  }

  async function restoreRow(id: number) {
    try {
      await restoreCatalog(KIND, id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo recuperar el registro.");
    }
  }

  return (
    <div className="module-page catalog-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">CONFIGURACIÓN</div>
          <h1>Tipos de montaje</h1>
          <p>Clasificación del montaje asociado al artículo a través de su familia.</p>
        </div>
        <button className="primary-button" onClick={startNew}>
          <Plus size={16} /> Nuevo tipo de montaje
        </button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      <div className="catalog-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Buscar tipos de montaje…"
          />
        </div>
        <select value={state} onChange={(e) => setState(e.target.value as typeof state)} aria-label="Estado">
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
          <option value="deleted">Marcados para borrado</option>
          <option value="all">Todos</option>
        </select>
        <button className="secondary-button" onClick={load}>
          <RotateCcw size={15} /> Actualizar
        </button>
      </div>

      <div className={`catalog-layout ${editing ? "has-editor" : ""}`}>
        <section className="panel">
          {loading ? (
            <div className="loading-block">Cargando…</div>
          ) : (
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
                  {rows.map((r) => {
                    const deleted = !!r.deleted_at;
                    return (
                      <tr key={r.id}>
                        <td>{r.code}</td>
                        <td>{r.name}</td>
                        <td>
                          <span className={`status ${deleted ? "inactive" : r.active ? "active" : "inactive"}`}>
                            {deleted ? "Marcado para borrado" : r.active ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td>
                          <div className="item-actions">
                            {!deleted && (
                              <button className="icon-action" title="Editar" onClick={() => startEdit(r)}>
                                <Edit3 size={15} />
                              </button>
                            )}
                            {deleted ? (
                              <button className="icon-action" title="Recuperar" onClick={() => restoreRow(r.id)}>
                                <Undo2 size={15} />
                              </button>
                            ) : (
                              <button className="icon-action danger" title="Marcar para borrado" onClick={() => removeRow(r.id)}>
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty">
                        <div className="empty-state">
                          <Wrench size={28} />
                          <strong>No hay tipos de montaje</strong>
                          <span>Prueba otra búsqueda o crea uno nuevo.</span>
                        </div>
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
                <h2>{form.id ? "Editar" : "Nuevo"} tipo de montaje</h2>
              </div>
              <button className="icon-action" onClick={() => setEditing(false)} title="Cancelar">
                <X size={17} />
              </button>
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
              <button className="secondary-button" onClick={() => setEditing(false)}>
                Cancelar
              </button>
              <button className="primary-button" disabled={saving} onClick={save}>
                <Save size={15} />
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
