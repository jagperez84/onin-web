import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Edit3, Eye, Layers, Plus, Save, Search, Trash2, Undo2 } from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import {
  createProductLineBehavior,
  getProductLineBehavior,
  listProductLineBehaviors,
  updateProductLineBehavior,
  type FallbackProfileEstimate,
  type ProductLineBehaviorForm,
  type ProductLineBehaviorRow,
  type ProductLineBehaviorStatus,
} from "../../services/catalog/productLineBehaviorRepository";
import "./product-line-behavior.css";

const emptyEstimate = (): FallbackProfileEstimate => ({ code: "", name: "", end_deduction_mm: 0, color: "" });

const emptyForm = (): ProductLineBehaviorForm => ({
  code: "",
  name: "",
  description: "",
  active: true,
  quantity_enabled: true,
  price_enabled: true,
  discount_enabled: true,
  dimensions_enabled: true,
  configuration_enabled: true,
  cut_calculation_enabled: false,
  length_enabled: false,
  characteristics_enabled: true,
  canvas_cut_enabled: false,
  roll_width_m: null,
  seam_allowance_width_m: null,
  seam_allowance_height_m: null,
  standard_bar_length_mm: null,
  fallback_profile_estimates: null,
});

const CAPABILITY_FIELDS: { key: keyof ProductLineBehaviorForm; label: string }[] = [
  { key: "quantity_enabled", label: "Cantidad" },
  { key: "price_enabled", label: "Precio" },
  { key: "discount_enabled", label: "Descuento" },
  { key: "dimensions_enabled", label: "Dimensiones" },
  { key: "configuration_enabled", label: "Configuración (selecciones/variables)" },
  { key: "characteristics_enabled", label: "Características (colores/acabados)" },
  { key: "length_enabled", label: "Longitud (perfiles/barras)" },
  { key: "cut_calculation_enabled", label: "Cálculo de corte" },
  { key: "canvas_cut_enabled", label: "Corte de lona" },
];

export function ProductLineBehaviorList() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<ProductLineBehaviorRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProductLineBehaviorStatus>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getActiveCompanies()
      .then((c) => setCompanyId(c[0]?.id ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la empresa."));
  }, []);

  async function load() {
    if (companyId === null) return;
    setLoading(true);
    setError("");
    try {
      setRows(await listProductLineBehaviors(companyId, search, status));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las líneas de comportamiento.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, status]);

  return (
    <div className="module-page product-line-behavior-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">CONFIGURACIÓN</div>
          <h1>Líneas de comportamiento</h1>
          <p>Define qué funciones y parámetros de corte usa cada familia de artículos (toldos, pérgolas, piscinas…).</p>
        </div>
        <button className="primary-button" onClick={() => navigate("/configuracion/lineas-comportamiento/nuevo")}>
          <Plus size={16} />
          Nueva línea
        </button>
      </div>
      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
            placeholder="Buscar por código o nombre…"
            autoFocus
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as ProductLineBehaviorStatus)}>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
          <option value="all">Todas</option>
        </select>
        <button className="secondary-button" onClick={() => void load()}>
          Buscar
        </button>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Estado</th>
              <th className="actions-col"></th>
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
                    <Layers size={28} />
                    <strong>No hay líneas de comportamiento</strong>
                    <span>Prueba con otra búsqueda o crea una nueva.</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/configuracion/lineas-comportamiento/${r.id}`}>{r.code || "—"}</Link>
                  </td>
                  <td>{r.name}</td>
                  <td>
                    <span className={`status ${r.active ? "active" : "inactive"}`}>{r.active ? "Activa" : "Inactiva"}</span>
                  </td>
                  <td className="actions-col">
                    <Link className="icon-button" title="Consultar" to={`/configuracion/lineas-comportamiento/${r.id}`}>
                      <Eye size={15} />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProductLineBehaviorDetail() {
  const { id } = useParams();
  return <ProductLineBehaviorDetailInner key={id ?? "new"} />;
}

function ProductLineBehaviorDetailInner() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isNew = id === "nuevo" || location.pathname.endsWith("/nuevo");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [data, setData] = useState<ProductLineBehaviorRow | null>(null);
  const [form, setForm] = useState<ProductLineBehaviorForm>(emptyForm());
  const [useDefaultEstimates, setUseDefaultEstimates] = useState(true);
  const [editing, setEditing] = useState(isNew);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getActiveCompanies()
      .then((c) => setCompanyId(c[0]?.id ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la empresa."));
  }, []);

  useEffect(() => {
    if (isNew || companyId === null) {
      setLoading(false);
      return;
    }
    if (!id || !/^[0-9]+$/.test(id)) {
      setLoading(false);
      setError("Identificador no válido.");
      return;
    }
    getProductLineBehavior(companyId, Number(id))
      .then((r) => {
        setData(r);
        applyRowToForm(r);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la línea de comportamiento."))
      .finally(() => setLoading(false));
  }, [companyId, id, isNew]);

  function applyRowToForm(r: ProductLineBehaviorRow) {
    const { id: _id, company_id: _companyId, ...rest } = r;
    setForm(rest);
    setUseDefaultEstimates(rest.fallback_profile_estimates == null);
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (companyId === null) return;
    setSaving(true);
    setError("");
    try {
      const payload: ProductLineBehaviorForm = {
        ...form,
        fallback_profile_estimates: useDefaultEstimates ? null : form.fallback_profile_estimates ?? [],
      };
      if (isNew) {
        const newId = await createProductLineBehavior(companyId, payload);
        navigate(`/configuracion/lineas-comportamiento/${newId}`, { replace: true });
      } else {
        if (!id) return;
        await updateProductLineBehavior(companyId, Number(id), payload);
        const fresh = await getProductLineBehavior(companyId, Number(id));
        setData(fresh);
        applyRowToForm(fresh);
        setEditing(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading-block">Cargando línea de comportamiento…</div>;

  const estimates = form.fallback_profile_estimates ?? [];

  return (
    <div className="module-page product-line-behavior-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">CONFIGURACIÓN</div>
          <h1>{isNew ? "Nueva línea de comportamiento" : data?.name || "Línea de comportamiento"}</h1>
          <p>{isNew ? "Alta de una nueva línea de comportamiento." : editing ? "Edición de la línea de comportamiento." : "Consulta de la línea de comportamiento."}</p>
        </div>
        <div className="page-actions">
          <button className="secondary-button" onClick={() => navigate("/configuracion/lineas-comportamiento")}>
            <ArrowLeft size={16} />
            Volver
          </button>
          {!isNew && !editing && (
            <button className="primary-button" onClick={() => setEditing(true)}>
              <Edit3 size={16} />
              Editar
            </button>
          )}
        </div>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <form className="panel" onSubmit={submit}>
        <div className="form-grid">
          <label>
            <span>Código</span>
            <input
              className={!editing ? "readonly-field" : ""}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={!editing}
              required
              maxLength={30}
            />
          </label>
          <label>
            <span>Nombre</span>
            <input
              className={!editing ? "readonly-field" : ""}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={!editing}
              required
              maxLength={120}
            />
          </label>
          <label>
            <span>Estado</span>
            <select
              className={!editing ? "readonly-field" : ""}
              value={form.active ? "active" : "inactive"}
              onChange={(e) => setForm({ ...form, active: e.target.value === "active" })}
              disabled={!editing}
            >
              <option value="active">Activa</option>
              <option value="inactive">Inactiva</option>
            </select>
          </label>
          <label className="wide">
            <span>Descripción</span>
            <input
              className={!editing ? "readonly-field" : ""}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={!editing}
              maxLength={250}
            />
          </label>
        </div>

        <div className="plb-section">
          <div className="plb-section-head">
            <div>
              <h2>Funciones activas</h2>
              <p>Qué secciones se muestran al configurar un artículo de esta línea.</p>
            </div>
          </div>
          <div className="plb-checkbox-grid">
            {CAPABILITY_FIELDS.map(({ key, label }) => (
              <label key={key} className={`plb-checkbox ${!editing ? "is-disabled" : ""}`}>
                <input
                  type="checkbox"
                  checked={Boolean(form[key])}
                  onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                  disabled={!editing}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="plb-section">
          <div className="plb-section-head">
            <div>
              <h2>Parámetros de corte</h2>
              <p>Solo se usan si "Cálculo de corte" está activo. Déjalos en blanco para usar el valor estándar de toldo enrollable.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              <span>Ancho de rollo (m)</span>
              <input
                className={!editing ? "readonly-field" : ""}
                type="number"
                step="0.01"
                min="0"
                placeholder="1,20 (por defecto)"
                value={form.roll_width_m ?? ""}
                onChange={(e) => setForm({ ...form, roll_width_m: e.target.value === "" ? null : Number(e.target.value) })}
                disabled={!editing}
              />
            </label>
            <label>
              <span>Margen de dobladillo lateral (m)</span>
              <input
                className={!editing ? "readonly-field" : ""}
                type="number"
                step="0.01"
                min="0"
                placeholder="0,04 (por defecto)"
                value={form.seam_allowance_width_m ?? ""}
                onChange={(e) => setForm({ ...form, seam_allowance_width_m: e.target.value === "" ? null : Number(e.target.value) })}
                disabled={!editing}
              />
            </label>
            <label>
              <span>Margen de vaina/enrolle (m)</span>
              <input
                className={!editing ? "readonly-field" : ""}
                type="number"
                step="0.01"
                min="0"
                placeholder="0,25 (por defecto)"
                value={form.seam_allowance_height_m ?? ""}
                onChange={(e) => setForm({ ...form, seam_allowance_height_m: e.target.value === "" ? null : Number(e.target.value) })}
                disabled={!editing}
              />
            </label>
            <label>
              <span>Longitud de barra estándar (mm)</span>
              <input
                className={!editing ? "readonly-field" : ""}
                type="number"
                step="1"
                min="0"
                placeholder="6000 (por defecto)"
                value={form.standard_bar_length_mm ?? ""}
                onChange={(e) => setForm({ ...form, standard_bar_length_mm: e.target.value === "" ? null : Number(e.target.value) })}
                disabled={!editing}
              />
            </label>
          </div>
        </div>

        <div className="plb-section">
          <div className="plb-section-head">
            <div>
              <h2>Estimación de perfiles sin despiece</h2>
              <p>Perfiles a mostrar en la hoja de trabajo cuando el artículo todavía no tiene despiece configurado.</p>
            </div>
            {editing && !useDefaultEstimates && (
              <button type="button" className="secondary-button" onClick={addEstimate}>
                <Plus size={14} />
                Añadir perfil
              </button>
            )}
          </div>
          <label className="plb-default-toggle">
            <input
              type="checkbox"
              checked={useDefaultEstimates}
              onChange={(e) => setUseDefaultEstimates(e.target.checked)}
              disabled={!editing}
            />
            Usar la estimación estándar de toldo enrollable (perfil de carga + tubo de enrolle)
          </label>
          {!useDefaultEstimates && (
            estimates.length === 0 ? (
              <p className="muted">Sin perfiles definidos — no se mostrará ninguna estimación mientras el artículo no tenga despiece.</p>
            ) : (
              <div className="table-panel">
                <table className="plb-estimates">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Descuento extremo (mm)</th>
                      <th>Color</th>
                      {editing && <th className="actions-col"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {estimates.map((estimate, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            className={!editing ? "readonly-field" : ""}
                            value={estimate.code}
                            onChange={(e) => patchEstimate(idx, { code: e.target.value })}
                            disabled={!editing}
                          />
                        </td>
                        <td>
                          <input
                            className={!editing ? "readonly-field" : ""}
                            value={estimate.name}
                            onChange={(e) => patchEstimate(idx, { name: e.target.value })}
                            disabled={!editing}
                          />
                        </td>
                        <td>
                          <input
                            className={!editing ? "readonly-field" : ""}
                            type="number"
                            step="1"
                            min="0"
                            value={estimate.end_deduction_mm}
                            onChange={(e) => patchEstimate(idx, { end_deduction_mm: Number(e.target.value) })}
                            disabled={!editing}
                          />
                        </td>
                        <td>
                          <input
                            className={!editing ? "readonly-field" : ""}
                            value={estimate.color ?? ""}
                            onChange={(e) => patchEstimate(idx, { color: e.target.value })}
                            placeholder="Opcional"
                            disabled={!editing}
                          />
                        </td>
                        {editing && (
                          <td className="actions-col">
                            <button type="button" className="icon-button" title="Eliminar perfil" onClick={() => removeEstimate(idx)}>
                              <Trash2 size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>

        <div className="form-footer">
          <div />
          <div className="page-actions">
            {editing && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  if (isNew) {
                    navigate("/configuracion/lineas-comportamiento");
                    return;
                  }
                  setEditing(false);
                  if (data) applyRowToForm(data);
                }}
              >
                <Undo2 size={15} />
                Cancelar
              </button>
            )}
            {editing && (
              <button type="submit" className="primary-button" disabled={saving}>
                <Save size={15} />
                Guardar
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
