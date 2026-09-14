import { useEffect, useMemo, useState } from "react";
import { Edit3, Plus, RotateCcw, Save, Search, Trash2, Undo2, X } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import {
  listCatalog,
  markCatalogForDeletion,
  restoreCatalog,
  upsertCatalog,
  type CatalogKind,
  type CatalogRow,
  type FallbackProfileEstimate,
} from "../../services/catalog/catalogRepository";
import "./catalog.css";

type GroupKey = "behavior" | "auxiliary";
type CatalogConfig = {
  key: CatalogKind;
  label: string;
  singular: string;
  description: string;
  group: GroupKey;
};
const CONFIGS: CatalogConfig[] = [
  {
    key: "types",
    label: "Tipos de producto",
    singular: "Tipo de producto",
    description: "Clasificación funcional del artículo.",
    group: "auxiliary",
  },
  {
    key: "lineBehaviors",
    label: "Comportamientos de línea",
    singular: "Comportamiento de línea",
    description:
      "Define qué información y capacidades necesita una línea de presupuesto.",
    group: "behavior",
  },
  {
    key: "mountingTypes",
    label: "Tipos de montaje",
    singular: "Tipo de montaje",
    description: "Clasificación del montaje asociado al artículo.",
    group: "behavior",
  },
  {
    key: "units",
    label: "Unidades de medida",
    singular: "Unidad",
    description: "Unidades utilizadas para expresar cantidades y medidas.",
    group: "auxiliary",
  },
  {
    key: "magnitudes",
    label: "Magnitudes",
    singular: "Magnitud",
    description:
      "Conceptos de medida reutilizables por la configuración dimensional.",
    group: "auxiliary",
  },
  {
    key: "colors",
    label: "Colores",
    singular: "Color",
    description: "Catálogo auxiliar de colores reutilizable por artículos.",
    group: "auxiliary",
  },
];
const GROUPS: Array<{ key: GroupKey; label: string; description: string }> = [
  {
    key: "behavior",
    label: "Comportamiento de línea",
    description:
      "Reglas que determinan cómo se comporta el artículo en un presupuesto.",
  },
  {
    key: "auxiliary",
    label: "Maestros auxiliares",
    description: "Datos reutilizables por artículos y configuraciones.",
  },
];
type FormState = {
  id?: number;
  code: string;
  name: string;
  description: string;
  active: boolean;
  quantity_enabled: boolean;
  price_enabled: boolean;
  discount_enabled: boolean;
  dimensions_enabled: boolean;
  configuration_enabled: boolean;
  cut_calculation_enabled: boolean;
  length_enabled: boolean;
  characteristics_enabled: boolean;
  canvas_cut_enabled: boolean;
  roll_width_m: number | null;
  seam_allowance_width_m: number | null;
  seam_allowance_height_m: number | null;
  standard_bar_length_mm: number | null;
  fallback_profile_estimates: FallbackProfileEstimate[] | null;
};
const emptyEstimate = (): FallbackProfileEstimate => ({ code: "", name: "", end_deduction_mm: 0, color: "" });
const emptyForm: FormState = {
  code: "",
  name: "",
  description: "",
  active: true,
  quantity_enabled: true,
  price_enabled: true,
  discount_enabled: true,
  dimensions_enabled: false,
  configuration_enabled: false,
  cut_calculation_enabled: false,
  length_enabled: false,
  characteristics_enabled: false,
  canvas_cut_enabled: false,
  roll_width_m: null,
  seam_allowance_width_m: null,
  seam_allowance_height_m: null,
  standard_bar_length_mm: null,
  fallback_profile_estimates: null,
};
const behaviorFields = [
  ["quantity_enabled", "Cantidad"],
  ["price_enabled", "Precio"],
  ["discount_enabled", "Descuento"],
  ["dimensions_enabled", "Dimensiones"],
  ["configuration_enabled", "Configuración"],
  ["cut_calculation_enabled", "Cálculo de corte"],
  ["length_enabled", "Longitud"],
  ["characteristics_enabled", "Características"],
  ["canvas_cut_enabled", "Corte de lona"],
] as const;
type BehaviorKey = (typeof behaviorFields)[number][0];
const isBehaviorEnabled = (row: CatalogRow, key: BehaviorKey) =>
  row[key] === true;

export function ProductCatalogV1() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [kind, setKind] = useState<CatalogKind>("types");
  const [group, setGroup] = useState<GroupKey>("auxiliary");
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"active" | "inactive" | "deleted" | "all">(
    "active",
  );
  const [form, setForm] = useState<FormState>(emptyForm);
  const [useDefaultEstimates, setUseDefaultEstimates] = useState(true);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const visibleConfigs = useMemo(
    () => CONFIGS.filter((c) => c.group === group),
    [group],
  );
  const current = CONFIGS.find((c) => c.key === kind) ?? CONFIGS[0];
  const behavior = kind === "lineBehaviors";

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
    if (companyId) load();
  }, [companyId, kind, state]);

  async function load() {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      const data = await listCatalog(kind, companyId, search, state);
      setRows(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cargar el catálogo.",
      );
    } finally {
      setLoading(false);
    }
  }

  function changeGroup(next: GroupKey) {
    const first = CONFIGS.find((c) => c.group === next)!;
    setGroup(next);
    setKind(first.key);
    setEditing(false);
    setSearch("");
  }

  function startNew() {
    setForm({ ...emptyForm });
    setUseDefaultEstimates(true);
    setEditing(true);
    setError("");
  }

  function startEdit(r: CatalogRow) {
    setForm({
      ...emptyForm,
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description ?? "",
      active: r.active,
      quantity_enabled: r.quantity_enabled !== false,
      price_enabled: r.price_enabled !== false,
      discount_enabled: r.discount_enabled !== false,
      dimensions_enabled: !!r.dimensions_enabled,
      configuration_enabled: !!r.configuration_enabled,
      cut_calculation_enabled: !!r.cut_calculation_enabled,
      length_enabled: !!r.length_enabled,
      characteristics_enabled: !!r.characteristics_enabled,
      canvas_cut_enabled: !!r.canvas_cut_enabled,
      roll_width_m: r.roll_width_m ?? null,
      seam_allowance_width_m: r.seam_allowance_width_m ?? null,
      seam_allowance_height_m: r.seam_allowance_height_m ?? null,
      standard_bar_length_mm: r.standard_bar_length_mm ?? null,
      fallback_profile_estimates: r.fallback_profile_estimates ?? null,
    });
    setUseDefaultEstimates((r.fallback_profile_estimates ?? null) == null);
    setEditing(true);
    setError("");
  }

  function patchEstimate(index: number, patch: Partial<FallbackProfileEstimate>) {
    setForm((f) => ({
      ...f,
      fallback_profile_estimates: (f.fallback_profile_estimates ?? []).map((e, idx) => (idx === index ? { ...e, ...patch } : e)),
    }));
  }
  function removeEstimate(index: number) {
    setForm((f) => ({ ...f, fallback_profile_estimates: (f.fallback_profile_estimates ?? []).filter((_, idx) => idx !== index) }));
  }
  function addEstimate() {
    setForm((f) => ({ ...f, fallback_profile_estimates: [...(f.fallback_profile_estimates ?? []), emptyEstimate()] }));
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
      const payload: FormState = behavior
        ? { ...form, fallback_profile_estimates: useDefaultEstimates ? null : form.fallback_profile_estimates ?? [] }
        : form;
      await upsertCatalog(kind, companyId, payload);
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
        title: "¿Marcar este dato para borrado?",
        message: "No se eliminará físicamente y podrá recuperarse.",
        danger: true,
      }))
    )
      return;
    try {
      await markCatalogForDeletion(kind, id);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo marcar para borrado.",
      );
    }
  }

  async function restoreRow(id: number) {
    try {
      await restoreCatalog(kind, id);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo recuperar el registro.",
      );
    }
  }

  return (
    <div className="module-page catalog-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">VENTAS / ARTÍCULOS</div>
          <h1>Catálogos auxiliares</h1>
          <p>
            Maestros y reglas de comportamiento reutilizables por artículos y
            líneas de presupuesto. Familias y Características tienen su propia
            pantalla, accesible desde el listado de Artículos.
          </p>
        </div>
        <button className="primary-button" onClick={startNew}>
          <Plus size={16} /> Nuevo {current.singular}
        </button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      <div className="catalog-tabs">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            className={group === g.key ? "catalog-tab active" : "catalog-tab"}
            onClick={() => changeGroup(g.key)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head">
          <div>
            <h2>{GROUPS.find((g) => g.key === group)?.label}</h2>
            <p>{GROUPS.find((g) => g.key === group)?.description}</p>
          </div>
        </div>
        <div className="catalog-tabs secondary-tabs">
          {visibleConfigs.map((c) => (
            <button
              key={c.key}
              className={kind === c.key ? "catalog-tab active" : "catalog-tab"}
              onClick={() => {
                setKind(c.key);
                setEditing(false);
                setSearch("");
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="catalog-toolbar">
        <div className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder={`Buscar ${current.label.toLowerCase()}…`}
          />
        </div>
        <select
          value={state}
          onChange={(e) => setState(e.target.value as typeof state)}
          aria-label="Estado"
        >
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
          <div className="panel-head">
            <div>
              <h2>{current.label}</h2>
              <p>{current.description}</p>
            </div>
          </div>
          {loading ? (
            <div className="loading-block">Cargando…</div>
          ) : (
            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    {behavior && <th>Capacidades</th>}
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const deleted = !!r.deleted_at;
                    const caps = behaviorFields
                      .filter(([key]) => isBehaviorEnabled(r, key))
                      .map(([, label]) => label)
                      .join(" · ");
                    return (
                      <tr key={r.id}>
                        <td>{r.code}</td>
                        <td>{r.name}</td>
                        {behavior && (
                          <td>{caps || "Sin capacidades adicionales"}</td>
                        )}
                        <td>
                          <span
                            className={`status ${deleted ? "inactive" : r.active ? "active" : "inactive"}`}
                          >
                            {deleted
                              ? "Marcado para borrado"
                              : r.active
                                ? "Activo"
                                : "Inactivo"}
                          </span>
                        </td>
                        <td>
                          <div className="item-actions">
                            {!deleted && (
                              <button
                                className="icon-action"
                                title="Editar"
                                onClick={() => startEdit(r)}
                              >
                                <Edit3 size={15} />
                              </button>
                            )}
                            {deleted ? (
                              <button
                                className="icon-action"
                                title="Recuperar"
                                onClick={() => restoreRow(r.id)}
                              >
                                <Undo2 size={15} />
                              </button>
                            ) : (
                              <button
                                className="icon-action danger"
                                title="Marcar para borrado"
                                onClick={() => removeRow(r.id)}
                              >
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
                      <td colSpan={behavior ? 5 : 4} className="empty">
                        No hay registros para este estado.
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
                <h2>
                  {form.id ? "Editar" : "Nuevo"} {current.singular}
                </h2>
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
              <label>
                Código *
                <input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </label>
              <label>
                Nombre *
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>

              {behavior && (
                <>
                  <label className="wide">
                    Descripción
                    <input
                      value={form.description}
                      onChange={(e) =>
                        setForm({ ...form, description: e.target.value })
                      }
                    />
                  </label>
                  <div className="wide">
                    <div className="form-section-title">
                      Capacidades de la línea
                    </div>
                    <div className="check-grid">
                      {behaviorFields.map(([key, label]) => (
                        <label key={key} className="inline-check">
                          <input
                            type="checkbox"
                            checked={form[key]}
                            onChange={(e) =>
                              setForm({ ...form, [key]: e.target.checked })
                            }
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="wide" style={{ marginTop: "14px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                    <div className="form-section-title">Parámetros de corte</div>
                    <p className="form-help">
                      Solo se usan si "Cálculo de corte" está activo. Déjalos en blanco para usar el valor estándar de toldo enrollable.
                    </p>
                    <div className="form-grid">
                      <label>
                        Ancho de rollo (m)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="1,20 (por defecto)"
                          value={form.roll_width_m ?? ""}
                          onChange={(e) => setForm({ ...form, roll_width_m: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        Margen de dobladillo lateral (m)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,04 (por defecto)"
                          value={form.seam_allowance_width_m ?? ""}
                          onChange={(e) => setForm({ ...form, seam_allowance_width_m: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        Margen de vaina/enrolle (m)
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,25 (por defecto)"
                          value={form.seam_allowance_height_m ?? ""}
                          onChange={(e) => setForm({ ...form, seam_allowance_height_m: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        Longitud de barra estándar (mm)
                        <input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="6000 (por defecto)"
                          value={form.standard_bar_length_mm ?? ""}
                          onChange={(e) => setForm({ ...form, standard_bar_length_mm: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="wide" style={{ marginTop: "14px", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <div>
                        <div className="form-section-title" style={{ marginBottom: "2px" }}>Estimación de perfiles sin despiece</div>
                        <p className="form-help" style={{ margin: 0 }}>
                          Perfiles a mostrar en la hoja de trabajo cuando el artículo todavía no tiene despiece configurado.
                        </p>
                      </div>
                      {!useDefaultEstimates && (
                        <button type="button" className="secondary-button compact" onClick={addEstimate}>
                          <Plus size={14} /> Añadir perfil
                        </button>
                      )}
                    </div>
                    <label className="inline-check" style={{ marginBottom: "10px" }}>
                      <input
                        type="checkbox"
                        checked={useDefaultEstimates}
                        onChange={(e) => setUseDefaultEstimates(e.target.checked)}
                      />
                      <span>Usar la estimación estándar de toldo enrollable (perfil de carga + tubo de enrolle)</span>
                    </label>
                    {!useDefaultEstimates && (
                      (form.fallback_profile_estimates ?? []).length === 0 ? (
                        <p className="form-help">Sin perfiles definidos — no se mostrará ninguna estimación mientras el artículo no tenga despiece.</p>
                      ) : (
                        <div className="table-panel">
                          <table>
                            <thead>
                              <tr>
                                <th>Código</th>
                                <th>Nombre</th>
                                <th>Descuento extremo (mm)</th>
                                <th>Color</th>
                                <th className="actions-col"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {(form.fallback_profile_estimates ?? []).map((estimate, idx) => (
                                <tr key={idx}>
                                  <td>
                                    <input value={estimate.code} onChange={(e) => patchEstimate(idx, { code: e.target.value })} />
                                  </td>
                                  <td>
                                    <input value={estimate.name} onChange={(e) => patchEstimate(idx, { name: e.target.value })} />
                                  </td>
                                  <td>
                                    <input
                                      type="number"
                                      step="1"
                                      min="0"
                                      value={estimate.end_deduction_mm}
                                      onChange={(e) => patchEstimate(idx, { end_deduction_mm: Number(e.target.value) })}
                                    />
                                  </td>
                                  <td>
                                    <input value={estimate.color ?? ""} placeholder="Opcional" onChange={(e) => patchEstimate(idx, { color: e.target.value })} />
                                  </td>
                                  <td className="actions-col">
                                    <button type="button" className="icon-action danger" title="Eliminar perfil" onClick={() => removeEstimate(idx)}>
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    )}
                  </div>
                </>
              )}

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
              <button
                className="primary-button"
                disabled={saving}
                onClick={save}
              >
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
