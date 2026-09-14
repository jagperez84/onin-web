import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Edit3,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import {
  listCatalog,
  getCatalogRow,
  upsertCatalog,
  markCatalogForDeletion,
  restoreCatalog,
  listAttributeValues,
  upsertAttributeValue,
  markAttributeValueForDeletion,
  restoreAttributeValue,
  type CatalogRow,
  type AttributeValue,
  type CatalogKind,
} from "../../services/catalog/catalogRepository";
import {
  listAttributeColors,
  addAttributeColor,
  removeAttributeColor,
  type AttributeColor,
} from "../../services/catalog/attributeColorRepository";

const KIND: CatalogKind = "attributes";

type Status = "active" | "inactive" | "deleted" | "all";

export function CharacteristicProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "nuevo";

  if (id) {
    return (
      <CharacteristicEditor
        characteristicId={isNew ? null : Number(id)}
        onSaved={(savedId) =>
          navigate(`/ventas/articulos/caracteristicas/${savedId}`)
        }
        onDeleted={() => navigate("/ventas/articulos/caracteristicas")}
      />
    );
  }
  return <CharacteristicList />;
}

function CharacteristicList() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getActiveCompanies()
      .then((cs) => setCompanyId(cs[0]?.id ?? null))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudo obtener la empresa activa."),
      );
  }, []);
  useEffect(() => {
    if (companyId) void load();
  }, [companyId, status]);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      setRows(await listCatalog(KIND, companyId, search, status));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el listado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="module-page product-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">VENTAS / ARTÍCULOS</div>
          <h1>Características</h1>
          <p>
            Datos configurables que pueden asociarse a familias y artículos
            (acabado, accionamiento, color…).
          </p>
        </div>
        <div className="product-head-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => navigate("/ventas/articulos/caracteristicas/nuevo")}
          >
            <Plus size={16} /> Nueva característica
          </button>
        </div>
      </div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Buscar características…"
            aria-label="Buscar características"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status)}
          aria-label="Estado"
        >
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
          <option value="deleted">Marcadas para borrado</option>
          <option value="all">Todas</option>
        </select>
        <button className="secondary-button" onClick={load}>
          <RotateCcw size={15} /> Actualizar
        </button>
        <span className="result-count">{rows.length} características</span>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="table-panel product-table">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4}>Cargando…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    <strong>No hay características</strong>
                    <span>Prueba otra búsqueda o crea una nueva característica.</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const deleted = !!r.deleted_at;
                return (
                  <tr key={r.id} className="clickable-row">
                    <td>
                      <button
                        type="button"
                        className="link-button primary-link"
                        onClick={() => navigate(`/ventas/articulos/caracteristicas/${r.id}`)}
                      >
                        {r.code}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => navigate(`/ventas/articulos/caracteristicas/${r.id}`)}
                      >
                        {r.name}
                      </button>
                    </td>
                    <td>{r.data_type ?? "TEXT"}</td>
                    <td>
                      <span className={`status ${deleted ? "inactive" : r.active ? "active" : "inactive"}`}>
                        {deleted ? "Marcada para borrado" : r.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const emptyForm = { code: "", name: "", data_type: "TEXT", active: true };
type FormState = typeof emptyForm;

function CharacteristicEditor({
  characteristicId,
  onSaved,
  onDeleted,
}: {
  characteristicId: number | null;
  onSaved: (id: number) => void;
  onDeleted: () => void;
}) {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [row, setRow] = useState<CatalogRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState(characteristicId === null);
  const [loading, setLoading] = useState(characteristicId !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Valores (solo si Tipo de dato = Opción)
  const [values, setValues] = useState<AttributeValue[]>([]);
  const [valueForm, setValueForm] = useState({ code: "", name: "", sort_order: 0 });

  // Colores
  const [colors, setColors] = useState<AttributeColor[]>([]);
  const [companyColors, setCompanyColors] = useState<CatalogRow[]>([]);
  const [colorToAddId, setColorToAddId] = useState("");
  const [colorBusy, setColorBusy] = useState(false);

  useEffect(() => {
    getActiveCompanies()
      .then((cs) => setCompanyId(cs[0]?.id ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo obtener la empresa activa."));
  }, []);

  useEffect(() => {
    if (companyId) void load();
  }, [companyId, characteristicId]);

  async function load() {
    if (!companyId) return;
    setError("");
    if (characteristicId === null) {
      setRow(null);
      setForm(emptyForm);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [detail, vals, cols, allColors] = await Promise.all([
        getCatalogRow(KIND, characteristicId),
        listAttributeValues(characteristicId, "all"),
        listAttributeColors(characteristicId),
        listCatalog("colors", companyId),
      ]);
      if (!detail) throw new Error("Característica no encontrada.");
      setRow(detail);
      setForm({
        code: detail.code,
        name: detail.name,
        data_type: detail.data_type ?? "TEXT",
        active: detail.active,
      });
      setValues(vals);
      setColors(cols);
      setCompanyColors(allColors);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la característica.");
    } finally {
      setLoading(false);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    if (!form.code.trim() || !form.name.trim()) {
      setError("Código y nombre son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await upsertCatalog(KIND, companyId, {
        id: characteristicId ?? undefined,
        code: form.code.trim(),
        name: form.name.trim(),
        active: form.active,
        data_type: form.data_type,
      });
      if (characteristicId === null && saved?.id) {
        onSaved(saved.id);
        return;
      }
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la característica.");
    } finally {
      setSaving(false);
    }
  }

  async function mark() {
    if (!row) return;
    if (
      !(await confirmDialog({
        title: `¿Marcar la característica ${row.code} para borrado?`,
        message: "No se eliminará físicamente y podrá recuperarse.",
        danger: true,
      }))
    )
      return;
    try {
      await markCatalogForDeletion(KIND, row.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar para borrado.");
    }
  }

  async function restore() {
    if (!row) return;
    try {
      await restoreCatalog(KIND, row.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo recuperar la característica.");
    }
  }

  async function saveValue() {
    if (characteristicId === null) return;
    if (!valueForm.code.trim() || !valueForm.name.trim()) {
      setError("Código y nombre del valor son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await upsertAttributeValue({ ...valueForm, attribute_id: characteristicId, active: true });
      setValueForm({ code: "", name: "", sort_order: 0 });
      setValues(await listAttributeValues(characteristicId, "all"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el valor.");
    } finally {
      setSaving(false);
    }
  }

  async function removeValue(id: number) {
    if (!(await confirmDialog({ title: "¿Marcar este valor para borrado?", danger: true }))) return;
    try {
      await markAttributeValueForDeletion(id);
      if (characteristicId !== null) setValues(await listAttributeValues(characteristicId, "all"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar para borrado.");
    }
  }

  async function restoreValue(id: number) {
    try {
      await restoreAttributeValue(id);
      if (characteristicId !== null) setValues(await listAttributeValues(characteristicId, "all"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo recuperar el valor.");
    }
  }

  async function addColor() {
    if (characteristicId === null || !colorToAddId) return;
    setColorBusy(true);
    setError("");
    try {
      await addAttributeColor(characteristicId, Number(colorToAddId));
      setColors(await listAttributeColors(characteristicId));
      setColorToAddId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asociar el color.");
    } finally {
      setColorBusy(false);
    }
  }

  async function removeColor(ac: AttributeColor) {
    if (
      !(await confirmDialog({
        title: `¿Quitar el color ${ac.color?.name ?? ""} de esta característica?`,
        danger: true,
      }))
    )
      return;
    setColorBusy(true);
    try {
      await removeAttributeColor(ac.id);
      if (characteristicId !== null) setColors(await listAttributeColors(characteristicId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar el color.");
    } finally {
      setColorBusy(false);
    }
  }

  const readOnly = !editing;
  const deleted = !!row?.deleted_at;
  const availableColorsToAdd = companyColors.filter(
    (c) => !colors.some((ac) => ac.color_id === c.id),
  );

  if (loading) return <div className="loading-block">Cargando característica…</div>;

  return (
    <div className="module-page product-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">
            VENTAS / ARTÍCULOS / CARACTERÍSTICAS / {characteristicId ?? "NUEVA"}
          </div>
          <h1>{characteristicId === null ? "Nueva característica" : `${row?.code}`}</h1>
          <p>
            {characteristicId === null
              ? "Alta de una característica del sistema."
              : row?.name || ""}
          </p>
        </div>
        <div className="product-head-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => navigate("/ventas/articulos/caracteristicas")}
          >
            <ArrowLeft size={15} /> Volver al listado
          </button>
          {characteristicId !== null && !deleted && !editing && (
            <button className="primary-button" type="button" onClick={() => setEditing(true)}>
              <Edit3 size={15} /> Editar
            </button>
          )}
          {characteristicId !== null &&
            (deleted ? (
              <button className="secondary-button" type="button" onClick={restore}>
                <Undo2 size={15} /> Recuperar
              </button>
            ) : (
              !editing && (
                <button className="danger-button" type="button" onClick={mark}>
                  <Trash2 size={15} /> Marcar para borrado
                </button>
              )
            ))}
        </div>
      </div>

      {error && <div className="inline-error">{error}</div>}
      {deleted && (
        <div className="soft-delete-banner">
          Esta característica está marcada para borrado. Se conserva para mantener la
          trazabilidad y no puede utilizarse en nuevas asignaciones.
        </div>
      )}

      <form onSubmit={save} className="product-detail-grid">
        <section className="panel product-profile-anchor">
          <div className="panel-head">
            <div>
              <h2>Datos generales</h2>
              <p>Identificación y tipo de dato de la característica.</p>
            </div>
            {row && (
              <span className={`status ${deleted ? "inactive" : row.active ? "active" : "inactive"}`}>
                {deleted ? "Marcada para borrado" : row.active ? "Activa" : "Inactiva"}
              </span>
            )}
          </div>
          <div className="form-grid">
            <label>
              Código *
              <input
                value={form.code}
                readOnly={readOnly}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </label>
            <label>
              Nombre *
              <input
                value={form.name}
                readOnly={readOnly}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Tipo de dato
              <select
                value={form.data_type}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, data_type: e.target.value })}
              >
                <option value="TEXT">Texto</option>
                <option value="NUMBER">Número</option>
                <option value="BOOLEAN">Booleano</option>
                <option value="OPTION">Opción</option>
              </select>
            </label>
            <label>
              Estado
              <select
                value={form.active ? "1" : "0"}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, active: e.target.value === "1" })}
              >
                <option value="1">Activa</option>
                <option value="0">Inactiva</option>
              </select>
            </label>
          </div>
          {editing && (
            <div className="actions">
              {characteristicId !== null && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    setEditing(false);
                    void load();
                  }}
                >
                  Cancelar
                </button>
              )}
              <button className="primary-button" type="submit" disabled={saving}>
                <Save size={15} /> {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          )}
        </section>

        {characteristicId === null ? (
          <div className="soft-delete-banner">
            Guarda la característica para poder gestionar sus valores y colores.
          </div>
        ) : (
          <>
            {form.data_type === "OPTION" && (
              <section className="panel product-profile-anchor">
                <div className="panel-head">
                  <div>
                    <h2>Valores</h2>
                    <p>Opciones seleccionables de esta característica.</p>
                  </div>
                  <span className="result-count">{values.length} valores</span>
                </div>
                <div className="form-grid">
                  <label>
                    Código
                    <input
                      value={valueForm.code}
                      onChange={(e) => setValueForm({ ...valueForm, code: e.target.value })}
                    />
                  </label>
                  <label>
                    Nombre
                    <input
                      value={valueForm.name}
                      onChange={(e) => setValueForm({ ...valueForm, name: e.target.value })}
                    />
                  </label>
                  <label>
                    Orden
                    <input
                      type="number"
                      value={valueForm.sort_order}
                      onChange={(e) =>
                        setValueForm({ ...valueForm, sort_order: Number(e.target.value) })
                      }
                    />
                  </label>
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={saving}
                      onClick={saveValue}
                    >
                      <Plus size={15} /> Añadir valor
                    </button>
                  </div>
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
                      {values.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="empty">
                            Sin valores definidos.
                          </td>
                        </tr>
                      ) : (
                        values.map((v) => (
                          <tr key={v.id}>
                            <td>{v.code}</td>
                            <td>{v.name}</td>
                            <td>
                              {v.deleted_at ? "Marcado para borrado" : v.active ? "Activo" : "Inactivo"}
                            </td>
                            <td>
                              <div className="item-actions">
                                {v.deleted_at ? (
                                  <button
                                    className="icon-action"
                                    onClick={() => restoreValue(v.id)}
                                    title="Recuperar"
                                  >
                                    <Undo2 size={15} />
                                  </button>
                                ) : (
                                  <button
                                    className="icon-action danger"
                                    onClick={() => removeValue(v.id)}
                                    title="Marcar para borrado"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="panel product-profile-anchor">
              <div className="panel-head">
                <div>
                  <h2>Colores</h2>
                  <p>
                    Familia y artículo heredarán este conjunto de colores, pudiendo
                    excluir los que no apliquen en cada caso.
                  </p>
                </div>
                <span className="result-count">{colors.length} colores</span>
              </div>
              <div className="form-grid">
                <label className="wide">
                  Añadir color
                  <div style={{ display: "flex", gap: "8px" }}>
                    <select value={colorToAddId} onChange={(e) => setColorToAddId(e.target.value)}>
                      <option value="">Selecciona un color…</option>
                      {availableColorsToAdd.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!colorToAddId || colorBusy}
                      onClick={addColor}
                    >
                      <Plus size={15} /> Añadir
                    </button>
                  </div>
                </label>
              </div>
              <div className="table-panel">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {colors.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="empty">
                          Sin colores asociados a esta característica.
                        </td>
                      </tr>
                    ) : (
                      colors.map((ac) => (
                        <tr key={ac.id}>
                          <td>{ac.color?.code ?? "—"}</td>
                          <td>{ac.color?.name ?? "—"}</td>
                          <td>
                            <div className="item-actions">
                              <button
                                className="icon-action danger"
                                title="Quitar"
                                disabled={colorBusy}
                                onClick={() => removeColor(ac)}
                              >
                                <Trash2 size={15} />
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
          </>
        )}
      </form>
    </div>
  );
}
