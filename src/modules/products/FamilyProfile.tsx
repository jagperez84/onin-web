import { Fragment, FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Edit3,
  Palette,
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
  type CatalogRow,
  type CatalogKind,
} from "../../services/catalog/catalogRepository";
import {
  listMeasurementTypes,
  type MeasurementType,
} from "../../services/catalog/measurementTypeRepository";
import {
  countProductsWithScalesInFamily,
  deleteAllProductScalesInFamily,
} from "../../services/catalog/productCommercialRepository";
import {
  listFamilyAttributeAssignments,
  listAvailableFamilyAttributes,
  assignFamilyAttribute,
  updateFamilyAttributeAssignment,
  removeFamilyAttributeAssignment,
  listFamilyAttributeScales,
  createFamilyAttributeScale,
  updateFamilyAttributeScale,
  markFamilyAttributeScaleForDeletion,
  listFamilyAttributeColorExclusions,
  excludeFamilyAttributeColor,
  includeFamilyAttributeColor,
  type FamilyAttributeAssignment,
  type FamilyAttributeRef,
  type FamilyAttributeScale,
  type FamilyAttributeColorExclusion,
} from "../../services/catalog/familyAttributeRepository";
import {
  listAttributeColors,
  type AttributeColor,
} from "../../services/catalog/attributeColorRepository";

const KIND: CatalogKind = "families";
type Status = "active" | "inactive" | "deleted" | "all";

export function FamilyProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "nuevo";

  if (id) {
    return (
      <FamilyEditor
        familyId={isNew ? null : Number(id)}
        onSaved={(savedId) => navigate(`/ventas/articulos/familias/${savedId}`)}
        onDeleted={() => navigate("/ventas/articulos/familias")}
      />
    );
  }
  return <FamilyList />;
}

function FamilyList() {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [lineBehaviors, setLineBehaviors] = useState<CatalogRow[]>([]);
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
      const [families, behaviors] = await Promise.all([
        listCatalog(KIND, companyId, search, status),
        listCatalog("lineBehaviors", companyId),
      ]);
      setRows(families);
      setLineBehaviors(behaviors);
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
          <h1>Familias</h1>
          <p>Clasificación comercial y configuración base que heredarán los artículos.</p>
        </div>
        <div className="product-head-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => navigate("/ventas/articulos/familias/nuevo")}
          >
            <Plus size={16} /> Nueva familia
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
            placeholder="Buscar familias…"
            aria-label="Buscar familias"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Estado">
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
          <option value="deleted">Marcadas para borrado</option>
          <option value="all">Todas</option>
        </select>
        <button className="secondary-button" onClick={load}>
          <RotateCcw size={15} /> Actualizar
        </button>
        <span className="result-count">{rows.length} familias</span>
      </div>
      {error && <div className="inline-error">{error}</div>}
      <div className="table-panel product-table">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo de corte</th>
              <th>Comportamiento de línea</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Cargando…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <strong>No hay familias</strong>
                    <span>Prueba otra búsqueda o crea una nueva familia.</span>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const deleted = !!r.deleted_at;
                const behavior = lineBehaviors.find((b) => b.id === r.line_behavior_id);
                const cutMode = r.confectionable ? "Confeccionable" : r.recuttable ? "Recortable" : "—";
                return (
                  <tr key={r.id} className="clickable-row">
                    <td>
                      <button
                        type="button"
                        className="link-button primary-link"
                        onClick={() => navigate(`/ventas/articulos/familias/${r.id}`)}
                      >
                        {r.code}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => navigate(`/ventas/articulos/familias/${r.id}`)}
                      >
                        {r.name}
                      </button>
                    </td>
                    <td>{cutMode}</td>
                    <td>{behavior ? `${behavior.code} · ${behavior.name}` : "—"}</td>
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

const emptyForm = {
  code: "",
  name: "",
  active: true,
  confectionable: false,
  recuttable: false,
  minimum_remainder: null as number | null,
  product_type_id: null as number | null,
  measurement_type_id: null as number | null,
  line_behavior_id: null as number | null,
  base_unit_id: null as number | null,
  stock_enabled: false,
  stock_minimum: 0,
  allow_negative_stock: false,
  include_measurements_in_stock: false,
  include_stock_by_color: false,
  scaled: false,
  scaled_by_characteristic: false,
  smooth_cut: false,
};
type FormState = typeof emptyForm;

function FamilyEditor({
  familyId,
  onSaved,
  onDeleted,
}: {
  familyId: number | null;
  onSaved: (id: number) => void;
  onDeleted: () => void;
}) {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [row, setRow] = useState<CatalogRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState(familyId === null);
  const [loading, setLoading] = useState(familyId !== null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [productTypes, setProductTypes] = useState<CatalogRow[]>([]);
  const [measurementTypes, setMeasurementTypes] = useState<MeasurementType[]>([]);
  const [lineBehaviors, setLineBehaviors] = useState<CatalogRow[]>([]);
  const [units, setUnits] = useState<CatalogRow[]>([]);

  // Características de la familia
  const [assignments, setAssignments] = useState<FamilyAttributeAssignment[]>([]);
  const [available, setAvailable] = useState<FamilyAttributeRef[]>([]);
  const [selectedAttrId, setSelectedAttrId] = useState<number | null>(null);
  const [attrRequired, setAttrRequired] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Colores y precio de la característica expandida en línea (sin modal)
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expColorOptions, setExpColorOptions] = useState<AttributeColor[]>([]);
  const [expExclusions, setExpExclusions] = useState<FamilyAttributeColorExclusion[]>([]);
  const [expScaled, setExpScaled] = useState(false);
  const [expPvp, setExpPvp] = useState("");
  const [expScales, setExpScales] = useState<FamilyAttributeScale[]>([]);
  const [expScaleForm, setExpScaleForm] = useState<{
    editing: number | null;
    dimension_1: string;
    dimension_2: string;
    price: string;
  } | null>(null);
  const [expBusy, setExpBusy] = useState(false);

  useEffect(() => {
    getActiveCompanies()
      .then((cs) => setCompanyId(cs[0]?.id ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo obtener la empresa activa."));
  }, []);

  useEffect(() => {
    if (companyId) void load();
  }, [companyId, familyId]);

  async function load() {
    if (!companyId) return;
    setError("");
    const [types, mTypes, behaviors, unitRows] = await Promise.all([
      listCatalog("types", companyId),
      listMeasurementTypes(companyId),
      listCatalog("lineBehaviors", companyId),
      listCatalog("units", companyId),
    ]);
    setProductTypes(types);
    setMeasurementTypes(mTypes);
    setLineBehaviors(behaviors);
    setUnits(unitRows);

    if (familyId === null) {
      setRow(null);
      setForm(emptyForm);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [detail, assigned, avail] = await Promise.all([
        getCatalogRow(KIND, familyId),
        listFamilyAttributeAssignments(familyId),
        listAvailableFamilyAttributes(companyId, familyId),
      ]);
      if (!detail) throw new Error("Familia no encontrada.");
      setRow(detail);
      setForm({
        code: detail.code,
        name: detail.name,
        active: detail.active,
        confectionable: !!detail.confectionable,
        recuttable: !!detail.recuttable,
        minimum_remainder: detail.minimum_remainder ?? null,
        product_type_id: detail.product_type_id ?? null,
        measurement_type_id: detail.measurement_type_id ?? null,
        line_behavior_id: detail.line_behavior_id ?? null,
        base_unit_id: detail.base_unit_id ?? null,
        stock_enabled: !!detail.stock_enabled,
        stock_minimum: detail.stock_minimum ?? 0,
        allow_negative_stock: !!detail.allow_negative_stock,
        include_measurements_in_stock: !!detail.include_measurements_in_stock,
        include_stock_by_color: !!detail.include_stock_by_color,
        scaled: !!detail.scaled,
        scaled_by_characteristic: !!detail.scaled_by_characteristic,
        smooth_cut: !!detail.smooth_cut,
      });
      setAssignments(assigned);
      setAvailable(avail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la familia.");
    } finally {
      setLoading(false);
    }
  }

  async function reloadAssignments() {
    if (familyId === null || !companyId) return;
    const [assigned, avail] = await Promise.all([
      listFamilyAttributeAssignments(familyId),
      listAvailableFamilyAttributes(companyId, familyId),
    ]);
    setAssignments(assigned);
    setAvailable(avail);
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
        id: familyId ?? undefined,
        code: form.code.trim(),
        name: form.name.trim(),
        active: form.active,
        confectionable: form.confectionable,
        recuttable: form.recuttable,
        minimum_remainder: form.minimum_remainder,
        product_type_id: form.product_type_id,
        measurement_type_id: form.measurement_type_id,
        line_behavior_id: form.line_behavior_id,
        base_unit_id: form.base_unit_id,
        stock_enabled: form.stock_enabled,
        stock_minimum: form.stock_minimum,
        allow_negative_stock: form.allow_negative_stock,
        include_measurements_in_stock: form.include_measurements_in_stock,
        include_stock_by_color: form.include_stock_by_color,
        scaled: form.scaled,
        scaled_by_characteristic: form.scaled_by_characteristic,
        smooth_cut: form.smooth_cut,
      });
      if (familyId === null && saved?.id) {
        onSaved(saved.id);
        return;
      }
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la familia.");
    } finally {
      setSaving(false);
    }
  }

  async function mark() {
    if (!row) return;
    if (
      !(await confirmDialog({
        title: `¿Marcar la familia ${row.code} para borrado?`,
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
      setError(e instanceof Error ? e.message : "No se pudo recuperar la familia.");
    }
  }

  async function addAttribute() {
    if (familyId === null || !selectedAttrId) return;
    setAssigning(true);
    setError("");
    try {
      const affected = await countProductsWithScalesInFamily(familyId);
      if (affected > 0) {
        const ok = await confirmDialog({
          title: "¿Añadir característica a la familia?",
          message: `${affected} artículo${affected === 1 ? "" : "s"} de esta familia tiene${affected === 1 ? "" : "n"} escalados por dimensión definidos. Se eliminarán al añadir esta característica.`,
          danger: true,
          confirmLabel: "Añadir y eliminar escalados",
        });
        if (!ok) {
          setAssigning(false);
          return;
        }
        await deleteAllProductScalesInFamily(familyId);
      }
      await assignFamilyAttribute(familyId, selectedAttrId, attrRequired, assignments.length);
      setSelectedAttrId(null);
      setAttrRequired(false);
      await reloadAssignments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar la característica.");
    } finally {
      setAssigning(false);
    }
  }

  async function toggleRequired(fa: FamilyAttributeAssignment) {
    try {
      await updateFamilyAttributeAssignment(fa.assignment_id, { required: !fa.required });
      await reloadAssignments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar la característica.");
    }
  }

  async function removeAttribute(fa: FamilyAttributeAssignment) {
    if (!(await confirmDialog({ title: `¿Quitar la característica "${fa.name}" de esta familia?`, danger: true })))
      return;
    try {
      await removeFamilyAttributeAssignment(fa.assignment_id);
      if (expandedId === fa.assignment_id) setExpandedId(null);
      await reloadAssignments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar la característica.");
    }
  }

  async function toggleExpanded(fa: FamilyAttributeAssignment) {
    if (expandedId === fa.assignment_id) {
      setExpandedId(null);
      return;
    }
    setError("");
    setExpandedId(fa.assignment_id);
    setExpScaled(fa.scaled);
    setExpPvp(fa.pvp == null ? "" : String(fa.pvp));
    setExpScaleForm(null);
    try {
      const [colorsOpts, exclusions, scales] = await Promise.all([
        listAttributeColors(fa.id),
        listFamilyAttributeColorExclusions(fa.assignment_id),
        listFamilyAttributeScales(fa.assignment_id),
      ]);
      setExpColorOptions(colorsOpts);
      setExpExclusions(exclusions);
      setExpScales(scales);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la información.");
    }
  }

  async function toggleExpColor(colorId: number) {
    if (expandedId === null) return;
    const existing = expExclusions.find((x) => x.color_id === colorId);
    setExpBusy(true);
    setError("");
    try {
      if (existing) await includeFamilyAttributeColor(existing.id);
      else await excludeFamilyAttributeColor(expandedId, colorId);
      setExpExclusions(await listFamilyAttributeColorExclusions(expandedId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el color.");
    } finally {
      setExpBusy(false);
    }
  }

  async function toggleExpScaled(next: boolean) {
    if (expandedId === null) return;
    setExpBusy(true);
    setError("");
    try {
      await updateFamilyAttributeAssignment(expandedId, { scaled: next });
      setExpScaled(next);
      await reloadAssignments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el tipo de precio.");
    } finally {
      setExpBusy(false);
    }
  }

  async function saveExpPvp() {
    if (expandedId === null) return;
    const value = expPvp.trim() === "" ? null : Number(expPvp);
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      setError("El precio debe ser un número válido.");
      return;
    }
    setExpBusy(true);
    setError("");
    try {
      await updateFamilyAttributeAssignment(expandedId, { pvp: value });
      await reloadAssignments();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el precio.");
    } finally {
      setExpBusy(false);
    }
  }

  function startExpScale(row?: FamilyAttributeScale) {
    setExpScaleForm({
      editing: row?.id ?? 0,
      dimension_1: row ? String(row.dimension_1) : "",
      dimension_2: row?.dimension_2 != null ? String(row.dimension_2) : "",
      price: row ? String(row.price) : "",
    });
  }

  async function saveExpScale() {
    if (expandedId === null || !expScaleForm) return;
    const dimension_1 = Number(expScaleForm.dimension_1);
    const dimension_2 = expScaleForm.dimension_2.trim() === "" ? null : Number(expScaleForm.dimension_2);
    const price = Number(expScaleForm.price);
    if (!Number.isFinite(dimension_1) || dimension_1 < 0) {
      setError("La dimensión 1 debe ser un número válido.");
      return;
    }
    if (dimension_2 != null && (!Number.isFinite(dimension_2) || dimension_2 < 0)) {
      setError("La dimensión 2 debe ser un número válido.");
      return;
    }
    setExpBusy(true);
    setError("");
    try {
      if (expScaleForm.editing === 0) await createFamilyAttributeScale(expandedId, { dimension_1, dimension_2, price });
      else if (expScaleForm.editing !== null)
        await updateFamilyAttributeScale(expScaleForm.editing, { dimension_1, dimension_2, price });
      setExpScales(await listFamilyAttributeScales(expandedId));
      setExpScaleForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el escalado.");
    } finally {
      setExpBusy(false);
    }
  }

  async function removeExpScale(id: number) {
    if (expandedId === null) return;
    if (!(await confirmDialog({ title: "¿Eliminar este tramo de escalado?", danger: true }))) return;
    setExpBusy(true);
    try {
      await markFamilyAttributeScaleForDeletion(id);
      setExpScales(await listFamilyAttributeScales(expandedId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el tramo.");
    } finally {
      setExpBusy(false);
    }
  }

  const readOnly = !editing;
  const deleted = !!row?.deleted_at;
  const selectedBehavior = lineBehaviors.find((b) => b.id === form.line_behavior_id) ?? null;
  const selectedMeasurementType = measurementTypes.find((m) => m.id === form.measurement_type_id) ?? null;
  const unitLabel = (unitId: number | null | undefined) => {
    if (unitId == null) return "Sin unidad";
    const u = units.find((x) => x.id === unitId);
    return u ? `${u.code} · ${u.name}` : "Sin unidad";
  };
  const scaleDim1 = selectedMeasurementType?.dimensions.find((d) => d.dimension_number === 1) ?? null;
  const scaleDim2 = selectedMeasurementType?.dimensions.find((d) => d.dimension_number === 2) ?? null;

  if (loading) return <div className="loading-block">Cargando familia…</div>;

  return (
    <div className="module-page product-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">VENTAS / ARTÍCULOS / FAMILIAS / {familyId ?? "NUEVA"}</div>
          <h1>{familyId === null ? "Nueva familia" : `${row?.code}`}</h1>
          <p>{familyId === null ? "Alta de una familia de artículos." : row?.name || ""}</p>
        </div>
        <div className="product-head-actions">
          <button className="secondary-button" type="button" onClick={() => navigate("/ventas/articulos/familias")}>
            <ArrowLeft size={15} /> Volver al listado
          </button>
          {familyId !== null && !deleted && !editing && (
            <button className="primary-button" type="button" onClick={() => setEditing(true)}>
              <Edit3 size={15} /> Editar
            </button>
          )}
          {familyId !== null &&
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
          Esta familia está marcada para borrado. Se conserva para mantener la trazabilidad.
        </div>
      )}

      <form onSubmit={save} className="product-detail-grid">
        <section className="panel product-profile-anchor">
          <div className="panel-head">
            <div>
              <h2>Datos generales</h2>
              <p>Identificación y configuración base de la familia.</p>
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
              <input value={form.code} readOnly={readOnly} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </label>
            <label>
              Nombre *
              <input value={form.name} readOnly={readOnly} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label>
              Tipo de producto
              <select
                value={form.product_type_id ?? ""}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, product_type_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Sin tipo</option>
                {productTypes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Unidad base
              <select
                value={form.base_unit_id ?? ""}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, base_unit_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Sin unidad</option>
                {units.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo de medida
              <select
                value={form.measurement_type_id ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  setForm({ ...form, measurement_type_id: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">Sin tipo de medida</option>
                {measurementTypes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedMeasurementType && (
              <div className="wide characteristic-inline-editor">
                <div className="form-section-title">Dimensiones que heredarán los artículos</div>
                {selectedMeasurementType.dimensions.length === 0 ? (
                  <p className="form-help">Este tipo de medida no tiene dimensiones definidas.</p>
                ) : (
                  <div className="table-panel">
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Dimensión</th>
                          <th>Unidad</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMeasurementType.dimensions.map((d) => (
                          <tr key={d.dimension_number}>
                            <td>{d.dimension_number}</td>
                            <td>{d.name || d.code}</td>
                            <td>{unitLabel(d.unit_id)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            <label>
              Comportamiento de línea
              <select
                value={form.line_behavior_id ?? ""}
                disabled={readOnly}
                onChange={(e) =>
                  setForm({ ...form, line_behavior_id: e.target.value ? Number(e.target.value) : null })
                }
              >
                <option value="">Sin comportamiento asignado</option>
                {lineBehaviors.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.code} · {x.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedBehavior && (
              <div className="wide characteristic-inline-editor">
                <div className="form-section-title">Configuración que heredarán los artículos de esta familia</div>
                <div className="check-grid">
                  <label className="inline-check">
                    <input type="checkbox" checked={!!selectedBehavior.quantity_enabled} disabled readOnly />
                    <span>Cantidad</span>
                  </label>
                  <label className="inline-check">
                    <input type="checkbox" checked={!!selectedBehavior.price_enabled} disabled readOnly />
                    <span>Precio</span>
                  </label>
                  <label className="inline-check">
                    <input type="checkbox" checked={!!selectedBehavior.discount_enabled} disabled readOnly />
                    <span>Descuento</span>
                  </label>
                  <label className="inline-check">
                    <input type="checkbox" checked={!!selectedBehavior.dimensions_enabled} disabled readOnly />
                    <span>Dimensiones</span>
                  </label>
                  <label className="inline-check">
                    <input type="checkbox" checked={!!selectedBehavior.configuration_enabled} disabled readOnly />
                    <span>Configuración</span>
                  </label>
                  <label className="inline-check">
                    <input type="checkbox" checked={!!selectedBehavior.characteristics_enabled} disabled readOnly />
                    <span>Características</span>
                  </label>
                </div>
              </div>
            )}
            <label>
              Tipo de corte
              <select
                value={form.confectionable ? "CONFECTIONABLE" : form.recuttable ? "RECUTTABLE" : ""}
                disabled={readOnly}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm({
                    ...form,
                    confectionable: val === "CONFECTIONABLE",
                    recuttable: val === "RECUTTABLE",
                    minimum_remainder: val === "" ? null : form.minimum_remainder,
                  });
                }}
              >
                <option value="">Ninguno</option>
                <option value="CONFECTIONABLE">Confeccionable</option>
                <option value="RECUTTABLE">Recortable</option>
              </select>
            </label>
            {(form.confectionable || form.recuttable) && (
              <label className="wide">
                Resto mínimo
                <input
                  type="number"
                  step="0.01"
                  readOnly={readOnly}
                  value={form.minimum_remainder ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, minimum_remainder: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  placeholder="0.00"
                />
              </label>
            )}
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
              {familyId !== null && (
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

        <section className="panel product-profile-anchor">
          <div className="panel-head">
            <div>
              <h2>Gestión de stock</h2>
              <p>
                Valores por defecto que se copiarán a los artículos nuevos de esta
                familia; cada artículo puede seguir ajustándolos después.
              </p>
            </div>
          </div>
          <div className="form-grid">
            <label className="check-card">
              <input
                type="checkbox"
                checked={form.stock_enabled}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, stock_enabled: e.target.checked })}
              />
              <span>
                <strong>Actualizar stock</strong>
                <small>El artículo participa en la gestión de existencias.</small>
              </span>
            </label>
            <label>
              Stock mínimo
              <input
                type="number"
                step="1"
                min="0"
                readOnly={readOnly || !form.stock_enabled}
                value={form.stock_minimum ?? 0}
                onChange={(e) => setForm({ ...form, stock_minimum: Number(e.target.value) })}
              />
            </label>
            <label className="check-card">
              <input
                type="checkbox"
                checked={form.allow_negative_stock}
                disabled={readOnly || !form.stock_enabled}
                onChange={(e) => setForm({ ...form, allow_negative_stock: e.target.checked })}
              />
              <span>
                <strong>Permitir stock negativo</strong>
                <small>Disponible sólo cuando se gestiona stock.</small>
              </span>
            </label>
            <label className="check-card">
              <input
                type="checkbox"
                checked={form.include_measurements_in_stock}
                disabled={readOnly || !form.stock_enabled}
                onChange={(e) => setForm({ ...form, include_measurements_in_stock: e.target.checked })}
              />
              <span>
                <strong>Incluir medidas en stock</strong>
              </span>
            </label>
            <label className="check-card">
              <input
                type="checkbox"
                checked={form.include_stock_by_color}
                disabled={readOnly || !form.stock_enabled}
                onChange={(e) => setForm({ ...form, include_stock_by_color: e.target.checked })}
              />
              <span>
                <strong>Incluir stock por color</strong>
              </span>
            </label>
            <label className="check-card">
              <input
                type="checkbox"
                checked={form.scaled}
                disabled={readOnly}
                onChange={(e) =>
                  setForm({
                    ...form,
                    scaled: e.target.checked,
                    scaled_by_characteristic: e.target.checked ? form.scaled_by_characteristic : false,
                  })
                }
              />
              <span>
                <strong>Escalado</strong>
                <small>Las relaciones de escalado se habilitan inmediatamente al activar esta opción.</small>
              </span>
            </label>
            <label className="check-card">
              <input
                type="checkbox"
                checked={form.scaled_by_characteristic}
                disabled={readOnly || !form.scaled}
                onChange={(e) => setForm({ ...form, scaled_by_characteristic: e.target.checked })}
              />
              <span>
                <strong>Escalado por característica</strong>
                <small>Requiere escalado.</small>
              </span>
            </label>
            <label className="check-card">
              <input
                type="checkbox"
                checked={form.smooth_cut}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, smooth_cut: e.target.checked })}
              />
              <span>
                <strong>Corte liso</strong>
              </span>
            </label>
          </div>
        </section>

        {familyId === null ? (
          <div className="soft-delete-banner">
            Guarda la familia para poder asignarle y gestionar sus características.
          </div>
        ) : (
          <section className="panel product-profile-anchor">
            <div className="panel-head">
              <div>
                <h2>Características de la familia</h2>
                <p>
                  Los artículos de esta familia heredarán estas características, con sus
                  colores y precios, pudiendo sobrescribirlos.
                </p>
              </div>
              <span className="result-count">{assignments.length} características</span>
            </div>

            <div className="form-grid">
              <label className="wide">
                Añadir característica
                <select value={selectedAttrId ?? ""} onChange={(e) => setSelectedAttrId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Seleccionar característica…</option>
                  {available.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check-card">
                <input type="checkbox" checked={attrRequired} onChange={(e) => setAttrRequired(e.target.checked)} />
                <span>
                  <strong>Obligatoria</strong>
                </span>
              </label>
              <div className="actions">
                <button
                  type="button"
                  className="primary-button"
                  disabled={!selectedAttrId || assigning}
                  onClick={addAttribute}
                >
                  <Plus size={15} /> {assigning ? "Asignando…" : "Asignar"}
                </button>
              </div>
            </div>

            <div className="table-panel">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Característica</th>
                    <th>Obligatoria</th>
                    <th>Precio / Colores</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="empty">
                        No hay características asignadas a esta familia.
                      </td>
                    </tr>
                  ) : (
                    assignments.map((fa) => (
                      <Fragment key={fa.assignment_id}>
                        <tr>
                          <td>{fa.code}</td>
                          <td>{fa.name}</td>
                          <td>
                            <button
                              type="button"
                              className={`status ${fa.required ? "active" : "inactive"}`}
                              style={{ cursor: "pointer", border: "none", background: "transparent", padding: "2px 6px", fontWeight: 600 }}
                              onClick={() => toggleRequired(fa)}
                            >
                              {fa.required ? "Sí" : "No"}
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="secondary-button compact"
                              onClick={() => toggleExpanded(fa)}
                              title="Gestionar colores y precio de esta característica"
                            >
                              <Palette size={13} />
                              {fa.scaled ? "Escalado" : fa.pvp != null ? `${fa.pvp.toFixed(2)} €` : "Sin precio"}
                            </button>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="icon-action danger"
                              style={{ width: "28px", height: "28px" }}
                              title="Quitar característica de la familia"
                              onClick={() => removeAttribute(fa)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                        {expandedId === fa.assignment_id && (
                          <tr key={`${fa.assignment_id}-expanded`}>
                            <td colSpan={5}>
                              <div className="characteristic-inline-editor">
                                <div className="form-section-title">Colores</div>
                                {expColorOptions.length === 0 ? (
                                  <p className="form-help">
                                    Esta característica no tiene colores asociados a nivel de sistema.
                                  </p>
                                ) : (
                                  <>
                                    <div className="check-grid">
                                      {expColorOptions.map((ac) => {
                                        const excluded = expExclusions.some((x) => x.color_id === ac.color_id);
                                        return (
                                          <label key={ac.id} className="inline-check">
                                            <input
                                              type="checkbox"
                                              checked={!excluded}
                                              disabled={expBusy}
                                              onChange={() => toggleExpColor(ac.color_id)}
                                            />
                                            <span>
                                              {ac.color?.code} · {ac.color?.name}
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                    <p className="form-help">
                                      Desmarca los colores que no apliquen a esta familia.
                                    </p>
                                  </>
                                )}

                                <div className="form-section-title" style={{ marginTop: "14px" }}>
                                  Precio
                                </div>
                                <label className="inline-check">
                                  <input
                                    type="checkbox"
                                    checked={expScaled}
                                    disabled={expBusy}
                                    onChange={(e) => toggleExpScaled(e.target.checked)}
                                  />
                                  <span>Escalado por cantidad</span>
                                </label>

                                {!expScaled ? (
                                  <div className="form-grid" style={{ marginTop: "10px" }}>
                                    <label className="wide">
                                      PVP
                                      <div style={{ display: "flex", gap: "8px" }}>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={expPvp}
                                          onChange={(e) => setExpPvp(e.target.value)}
                                        />
                                        <button type="button" className="secondary-button" disabled={expBusy} onClick={saveExpPvp}>
                                          Guardar
                                        </button>
                                      </div>
                                    </label>
                                  </div>
                                ) : (
                                  <>
                                    <div style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0" }}>
                                      <button type="button" className="secondary-button compact" onClick={() => startExpScale()}>
                                        <Plus size={13} /> Añadir tramo
                                      </button>
                                    </div>
                                    {expScaleForm && (
                                      <div className="form-grid" style={{ marginBottom: "10px" }}>
                                        <label>
                                          {scaleDim1?.name || "Dimensión 1"}
                                          <input
                                            type="number"
                                            value={expScaleForm.dimension_1}
                                            onChange={(e) => setExpScaleForm({ ...expScaleForm, dimension_1: e.target.value })}
                                          />
                                        </label>
                                        {scaleDim2 && (
                                          <label>
                                            {scaleDim2.name}
                                            <input
                                              type="number"
                                              value={expScaleForm.dimension_2}
                                              onChange={(e) => setExpScaleForm({ ...expScaleForm, dimension_2: e.target.value })}
                                            />
                                          </label>
                                        )}
                                        <label>
                                          Precio
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={expScaleForm.price}
                                            onChange={(e) => setExpScaleForm({ ...expScaleForm, price: e.target.value })}
                                          />
                                        </label>
                                        <div className="actions wide">
                                          <button type="button" className="secondary-button" onClick={() => setExpScaleForm(null)}>
                                            Cancelar
                                          </button>
                                          <button type="button" className="primary-button" disabled={expBusy} onClick={saveExpScale}>
                                            <Save size={14} /> Guardar tramo
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                    <div className="table-panel">
                                      <table>
                                        <thead>
                                          <tr>
                                            <th>{scaleDim1?.name || "Dim. 1"}</th>
                                            {scaleDim2 && <th>{scaleDim2.name}</th>}
                                            <th>Precio</th>
                                            <th></th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {expScales.length === 0 ? (
                                            <tr>
                                              <td colSpan={scaleDim2 ? 4 : 3} className="empty">
                                                Sin tramos definidos.
                                              </td>
                                            </tr>
                                          ) : (
                                            expScales.map((s) => (
                                              <tr key={s.id}>
                                                <td>{s.dimension_1}</td>
                                                {scaleDim2 && <td>{s.dimension_2 ?? "—"}</td>}
                                                <td>{s.price.toFixed(2)} €</td>
                                                <td>
                                                  <div className="item-actions">
                                                    <button className="icon-action" title="Editar" onClick={() => startExpScale(s)}>
                                                      <Edit3 size={14} />
                                                    </button>
                                                    <button
                                                      className="icon-action danger"
                                                      title="Eliminar"
                                                      onClick={() => removeExpScale(s.id)}
                                                    >
                                                      <Trash2 size={14} />
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            ))
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </form>
    </div>
  );
}
