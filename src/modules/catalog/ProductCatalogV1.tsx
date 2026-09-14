import { useEffect, useMemo, useState } from "react";
import {
  Edit3,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { getActiveCompanies } from "../../services/core/coreRepository";
import { confirmDialog } from "../../components/ui/ConfirmDialog";
import {
  listCatalog,
  listAttributeValues,
  markAttributeValueForDeletion,
  restoreAttributeValue,
  upsertAttributeValue,
  markCatalogForDeletion,
  restoreCatalog,
  upsertCatalog,
  type AttributeValue,
  type CatalogKind,
  type CatalogRow,
  type FallbackProfileEstimate,
} from "../../services/catalog/catalogRepository";
import {
  listAttributeColors,
  addAttributeColor,
  removeAttributeColor,
  getAttributeColorCounts,
  type AttributeColor,
} from "../../services/catalog/attributeColorRepository";
import {
  listMeasurementTypes,
  type MeasurementType,
} from "../../services/catalog/measurementTypeRepository";
import {
  listFamilyAttributeAssignments,
  listAvailableFamilyAttributes,
  assignFamilyAttribute,
  updateFamilyAttributeAssignment,
  removeFamilyAttributeAssignment,
  getFamilyAttributesCounts,
  type FamilyAttributeAssignment,
  type FamilyAttributeRef,
} from "../../services/catalog/familyAttributeRepository";
import "./catalog.css";

type GroupKey = "product" | "behavior" | "auxiliary";
type CatalogConfig = {
  key: CatalogKind;
  label: string;
  singular: string;
  description: string;
  group: GroupKey;
};
const CONFIGS: CatalogConfig[] = [
  {
    key: "families",
    label: "Familias",
    singular: "Familia",
    description:
      "Define la clasificación comercial y la configuración base que heredarán los artículos.",
    group: "product",
  },
  {
    key: "types",
    label: "Tipos de producto",
    singular: "Tipo de producto",
    description: "Clasificación funcional del artículo.",
    group: "product",
  },
  {
    key: "attributes",
    label: "Características",
    singular: "Característica",
    description: "Datos configurables que pueden asociarse a los artículos.",
    group: "product",
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
    key: "product",
    label: "Artículos",
    description: "Maestros que definen qué es un artículo.",
  },
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
  confectionable: boolean;
  recuttable: boolean;
  minimum_remainder: number | null;
  product_type_id: number | null;
  measurement_type_id: number | null;
  mounting_type_id: number | null;
  line_behavior_id: number | null;
  data_type: string;
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
  confectionable: false,
  recuttable: false,
  minimum_remainder: null,
  product_type_id: null,
  measurement_type_id: null,
  mounting_type_id: null,
  line_behavior_id: null,
  data_type: "TEXT",
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
const emptyValue = {
  id: undefined as number | undefined,
  code: "",
  name: "",
  active: true,
  sort_order: 0,
};

export function ProductCatalogV1() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [kind, setKind] = useState<CatalogKind>("families");
  const [group, setGroup] = useState<GroupKey>("product");
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
  const [selectedAttribute, setSelectedAttribute] = useState<CatalogRow | null>(
    null,
  );
  const [attributeValues, setAttributeValues] = useState<AttributeValue[]>([]);
  const [valueForm, setValueForm] = useState(emptyValue);
  const [attributeColorCounts, setAttributeColorCounts] = useState<Record<number, number>>({});
  const [selectedAttributeForColors, setSelectedAttributeForColors] = useState<CatalogRow | null>(null);
  const [attributeColors, setAttributeColors] = useState<AttributeColor[]>([]);
  const [companyColorOptions, setCompanyColorOptions] = useState<CatalogRow[]>([]);
  const [colorToAddId, setColorToAddId] = useState("");
  const [colorPanelBusy, setColorPanelBusy] = useState(false);
  const [colorPanelError, setColorPanelError] = useState("");
  const [references, setReferences] = useState<{
    productTypes: CatalogRow[];
    measurementTypes: MeasurementType[];
    mountingTypes: CatalogRow[];
    lineBehaviors: CatalogRow[];
  }>({
    productTypes: [],
    measurementTypes: [],
    mountingTypes: [],
    lineBehaviors: [],
  });

  // Family characteristics state
  const [familyAttributes, setFamilyAttributes] = useState<
    FamilyAttributeAssignment[]
  >([]);
  const [availableFamilyAttributes, setAvailableFamilyAttributes] = useState<
    FamilyAttributeRef[]
  >([]);
  const [selectedFamilyAttrId, setSelectedFamilyAttrId] = useState<
    number | null
  >(null);
  const [familyAttrRequired, setFamilyAttrRequired] = useState(false);
  const [savingFamilyAttr, setSavingFamilyAttr] = useState(false);
  const [familyAttrCounts, setFamilyAttrCounts] = useState<
    Record<number, number>
  >({});

  const visibleConfigs = useMemo(
    () => CONFIGS.filter((c) => c.group === group),
    [group],
  );
  const current = CONFIGS.find((c) => c.key === kind) ?? CONFIGS[0];
  const family = kind === "families";
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
      if (family) {
        const [productTypes, measurementTypes, attrCounts] = await Promise.all([
          listCatalog("types", companyId),
          listMeasurementTypes(companyId),
          getFamilyAttributesCounts(),
        ]);
        setReferences((r) => ({ ...r, productTypes, measurementTypes }));
        setFamilyAttrCounts(attrCounts);
      } else if (behavior) {
        setReferences((r) => ({ ...r, lineBehaviors: data }));
      }
      if (kind === "attributes") {
        setAttributeColorCounts(await getAttributeColorCounts());
      } else {
        setSelectedAttribute(null);
        setAttributeValues([]);
        setSelectedAttributeForColors(null);
        setAttributeColors([]);
      }
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
    setSelectedAttribute(null);
    setSelectedAttributeForColors(null);
    setSearch("");
  }

  function startNew() {
    setForm({ ...emptyForm });
    setUseDefaultEstimates(true);
    setFamilyAttributes([]);
    setAvailableFamilyAttributes([]);
    setSelectedFamilyAttrId(null);
    setFamilyAttrRequired(false);
    setEditing(true);
    setError("");
  }

  async function loadFamilyAttributes(familyId: number) {
    if (!companyId) return;
    try {
      const [assigned, available] = await Promise.all([
        listFamilyAttributeAssignments(familyId),
        listAvailableFamilyAttributes(companyId, familyId),
      ]);
      setFamilyAttributes(assigned);
      setAvailableFamilyAttributes(available);
      setSelectedFamilyAttrId(null);
      setFamilyAttrRequired(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudieron cargar las características de la familia.",
      );
    }
  }

  async function addFamilyAttr(familyId: number) {
    if (!selectedFamilyAttrId) return;
    setSavingFamilyAttr(true);
    setError("");
    try {
      await assignFamilyAttribute(
        familyId,
        selectedFamilyAttrId,
        familyAttrRequired,
        familyAttributes.length,
      );
      await loadFamilyAttributes(familyId);
      const counts = await getFamilyAttributesCounts();
      setFamilyAttrCounts(counts);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo asignar la característica.",
      );
    } finally {
      setSavingFamilyAttr(false);
    }
  }

  async function toggleFamilyAttrRequired(fa: FamilyAttributeAssignment) {
    try {
      await updateFamilyAttributeAssignment(fa.assignment_id, {
        required: !fa.required,
      });
      if (fa.family_id) {
        await loadFamilyAttributes(fa.family_id);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo actualizar la característica.",
      );
    }
  }

  async function removeFamilyAttr(fa: FamilyAttributeAssignment) {
    if (
      !(await confirmDialog({
        title: `¿Quitar la característica "${fa.name}" de esta familia?`,
        danger: true,
      }))
    )
      return;
    try {
      await removeFamilyAttributeAssignment(fa.assignment_id);
      if (fa.family_id) {
        await loadFamilyAttributes(fa.family_id);
        const counts = await getFamilyAttributesCounts();
        setFamilyAttrCounts(counts);
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo quitar la característica.",
      );
    }
  }

  function startEdit(r: CatalogRow) {
    setForm({
      ...emptyForm,
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description ?? "",
      active: r.active,
      confectionable: !!r.confectionable,
      recuttable: !!r.recuttable,
      minimum_remainder: r.minimum_remainder ?? null,
      product_type_id: r.product_type_id ?? null,
      measurement_type_id: r.measurement_type_id ?? null,
      mounting_type_id: r.mounting_type_id ?? null,
      line_behavior_id: r.line_behavior_id ?? null,
      data_type: r.data_type ?? "TEXT",
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
    if (family && r.id) {
      loadFamilyAttributes(r.id);
    } else {
      setFamilyAttributes([]);
      setAvailableFamilyAttributes([]);
      setSelectedFamilyAttrId(null);
      setFamilyAttrRequired(false);
    }
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
      const saved = await upsertCatalog(kind, companyId, payload);
      if (!form.id && saved?.id && family) {
        setForm((prev) => ({ ...prev, id: saved.id }));
        await load();
        await loadFamilyAttributes(saved.id);
      } else {
        setEditing(false);
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function selectAttribute(r: CatalogRow) {
    setSelectedAttributeForColors(null);
    setSelectedAttribute(r);
    setValueForm({ ...emptyValue });
    try {
      setAttributeValues(await listAttributeValues(r.id));
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudieron cargar los valores.",
      );
    }
  }

  async function selectAttributeColors(r: CatalogRow) {
    setSelectedAttribute(null);
    setSelectedAttributeForColors(r);
    setColorToAddId("");
    setColorPanelError("");
    try {
      const [colors, available] = await Promise.all([
        listAttributeColors(r.id),
        companyId ? listCatalog("colors", companyId) : Promise.resolve([]),
      ]);
      setAttributeColors(colors);
      setCompanyColorOptions(available);
    } catch (e) {
      setColorPanelError(
        e instanceof Error ? e.message : "No se pudieron cargar los colores.",
      );
    }
  }

  function closeAttributeColors() {
    setSelectedAttributeForColors(null);
    setAttributeColors([]);
    setColorPanelError("");
  }

  async function addColorToAttribute() {
    if (!selectedAttributeForColors || !colorToAddId) return;
    setColorPanelBusy(true);
    setColorPanelError("");
    try {
      await addAttributeColor(selectedAttributeForColors.id, Number(colorToAddId));
      setAttributeColors(await listAttributeColors(selectedAttributeForColors.id));
      setAttributeColorCounts(await getAttributeColorCounts());
      setColorToAddId("");
    } catch (e) {
      setColorPanelError(
        e instanceof Error ? e.message : "No se pudo asociar el color.",
      );
    } finally {
      setColorPanelBusy(false);
    }
  }

  async function removeColorFromAttribute(ac: AttributeColor) {
    if (
      !(await confirmDialog({
        title: `¿Quitar el color ${ac.color?.name ?? ""} de esta característica?`,
        danger: true,
      }))
    )
      return;
    setColorPanelBusy(true);
    try {
      await removeAttributeColor(ac.id);
      if (selectedAttributeForColors) {
        setAttributeColors(await listAttributeColors(selectedAttributeForColors.id));
      }
      setAttributeColorCounts(await getAttributeColorCounts());
    } catch (e) {
      setColorPanelError(
        e instanceof Error ? e.message : "No se pudo quitar el color.",
      );
    } finally {
      setColorPanelBusy(false);
    }
  }

  const availableColorsToAdd = companyColorOptions.filter(
    (color) => !attributeColors.some((ac) => ac.color_id === color.id),
  );

  async function saveValue() {
    if (!selectedAttribute) return;
    if (!valueForm.code.trim() || !valueForm.name.trim()) {
      setError("Código y nombre del valor son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await upsertAttributeValue({
        ...valueForm,
        attribute_id: selectedAttribute.id,
      });
      setValueForm({ ...emptyValue });
      setAttributeValues(await listAttributeValues(selectedAttribute.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el valor.");
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

  async function removeValue(id: number) {
    if (!(await confirmDialog({ title: "¿Marcar este valor para borrado?", danger: true })))
      return;
    try {
      await markAttributeValueForDeletion(id);
      if (selectedAttribute)
        setAttributeValues(await listAttributeValues(selectedAttribute.id));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo marcar para borrado.",
      );
    }
  }

  async function restoreValue(id: number) {
    try {
      await restoreAttributeValue(id);
      if (selectedAttribute)
        setAttributeValues(await listAttributeValues(selectedAttribute.id));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo recuperar el valor.",
      );
    }
  }

  const typeName = (id?: number | null) =>
    references.productTypes.find((x) => x.id === id)?.name ?? "—";
  const measurementTypeName = (id?: number | null) =>
    references.measurementTypes.find((x) => x.id === id)?.name ?? "—";

  return (
    <div className="module-page catalog-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">VENTAS / ARTÍCULOS</div>
          <h1>Configuración de artículos</h1>
          <p>
            Maestros y reglas que definen cómo se comportan los artículos y sus
            líneas de presupuesto.
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
                setSelectedAttribute(null);
                setSelectedAttributeForColors(null);
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

      <div
        className={`catalog-layout ${editing || (kind === "attributes" && (selectedAttribute || selectedAttributeForColors)) ? "has-editor" : ""}`}
      >
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
                    {family && (
                      <>
                        <th>Tipo producto</th>
                        <th>Tipo de medida</th>
                        <th>Características</th>
                        <th>Confeccionable</th>
                        <th>Recortable</th>
                        <th>Resto mínimo</th>
                      </>
                    )}
                    {behavior && <th>Capacidades</th>}
                    {kind === "attributes" && (
                      <>
                        <th>Tipo</th>
                        <th>Colores</th>
                      </>
                    )}
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
                        {family && (
                          <>
                            <td>{typeName(r.product_type_id)}</td>
                            <td>
                              {measurementTypeName(r.measurement_type_id)}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="secondary-button compact"
                                onClick={() => startEdit(r)}
                                title="Gestionar características de esta familia"
                              >
                                {familyAttrCounts[r.id] ?? 0}{" "}
                                {familyAttrCounts[r.id] === 1
                                  ? "característica"
                                  : "características"}
                              </button>
                            </td>
                            <td>{r.confectionable ? "Sí" : "No"}</td>
                            <td>{r.recuttable ? "Sí" : "No"}</td>
                            <td>
                              {(r.confectionable || r.recuttable) &&
                              r.minimum_remainder != null
                                ? r.minimum_remainder
                                : "—"}
                            </td>
                          </>
                        )}
                        {behavior && (
                          <td>{caps || "Sin capacidades adicionales"}</td>
                        )}
                        {kind === "attributes" && (
                          <>
                            <td>{r.data_type ?? "TEXT"}</td>
                            <td>
                              <button
                                type="button"
                                className="secondary-button compact"
                                onClick={() => selectAttributeColors(r)}
                                title="Gestionar colores de esta característica"
                              >
                                <Palette size={13} />
                                {attributeColorCounts[r.id] ?? 0}{" "}
                                {attributeColorCounts[r.id] === 1 ? "color" : "colores"}
                              </button>
                            </td>
                          </>
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
                            {kind === "attributes" && !deleted && (
                              <button
                                className="secondary-button compact"
                                onClick={() => selectAttribute(r)}
                              >
                                Valores
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
                      <td colSpan={family ? 9 : behavior ? 5 : 6} className="empty">
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

              {family && (
                <>
                  <label>
                    Tipo de producto
                    <select
                      value={form.product_type_id ?? ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          product_type_id: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">Sin tipo</option>
                      {references.productTypes.map((x) => (
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
                      onChange={(e) =>
                        setForm({
                          ...form,
                          measurement_type_id: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                    >
                      <option value="">Sin tipo de medida</option>
                      {references.measurementTypes.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.code} · {x.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="wide inline-check">
                    <input
                      type="checkbox"
                      checked={form.confectionable}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setForm({
                          ...form,
                          confectionable: val,
                          minimum_remainder:
                            !val && !form.recuttable
                              ? null
                              : form.minimum_remainder,
                        });
                      }}
                    />
                    <span>Confeccionable</span>
                  </label>

                  <label className="wide inline-check">
                    <input
                      type="checkbox"
                      checked={form.recuttable}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setForm({
                          ...form,
                          recuttable: val,
                          minimum_remainder:
                            !form.confectionable && !val
                              ? null
                              : form.minimum_remainder,
                        });
                      }}
                    />
                    <span>Recortable</span>
                  </label>

                  {(form.confectionable || form.recuttable) && (
                    <label className="wide">
                      Resto mínimo
                      <input
                        type="number"
                        step="0.01"
                        value={form.minimum_remainder ?? ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            minimum_remainder:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                        placeholder="0.00"
                      />
                    </label>
                  )}

                  {/* Sección de Características de la Familia */}
                  <div
                    className="wide"
                    style={{
                      marginTop: "14px",
                      borderTop: "1px solid var(--border)",
                      paddingTop: "14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "8px",
                      }}
                    >
                      <div>
                        <div
                          className="form-section-title"
                          style={{ fontSize: "13px", margin: 0 }}
                        >
                          Características de la familia
                        </div>
                        <p className="form-help" style={{ margin: "2px 0 0" }}>
                          Relaciona características (atributos) que los
                          artículos de esta familia podrán tener.
                        </p>
                      </div>
                      {form.id && (
                        <span
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "var(--primary)",
                            background: "var(--canvas-stripe)",
                            padding: "2px 8px",
                            borderRadius: "12px",
                          }}
                        >
                          {familyAttributes.length}{" "}
                          {familyAttributes.length === 1
                            ? "característica"
                            : "características"}
                        </span>
                      )}
                    </div>

                    {!form.id ? (
                      <div
                        style={{
                          background: "#f8fafc",
                          border: "1px dashed #cbd5e1",
                          padding: "12px",
                          borderRadius: "7px",
                          fontSize: "12px",
                          color: "#64748b",
                        }}
                      >
                        Guarda la familia para poder asignarle y gestionar sus
                        características.
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            alignItems: "flex-end",
                            marginBottom: "10px",
                            flexWrap: "wrap",
                          }}
                        >
                          <label style={{ flex: "1 1 180px", margin: 0 }}>
                            <span
                              style={{
                                fontSize: "11px",
                                color: "#64748b",
                                fontWeight: 600,
                                display: "block",
                                marginBottom: "4px",
                              }}
                            >
                              Añadir característica
                            </span>
                            <select
                              value={selectedFamilyAttrId ?? ""}
                              onChange={(e) =>
                                setSelectedFamilyAttrId(
                                  e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                )
                              }
                              style={{ width: "100%" }}
                            >
                              <option value="">
                                Seleccionar característica…
                              </option>
                              {availableFamilyAttributes.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} · {a.name} ({a.data_type})
                                </option>
                              ))}
                            </select>
                          </label>

                          <label
                            className="inline-check"
                            style={{
                              paddingBottom: "8px",
                              margin: 0,
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={familyAttrRequired}
                              onChange={(e) =>
                                setFamilyAttrRequired(e.target.checked)
                              }
                            />
                            <span style={{ fontSize: "12px", fontWeight: 600 }}>
                              Obligatorio
                            </span>
                          </label>

                          <button
                            type="button"
                            className="primary-button"
                            disabled={!selectedFamilyAttrId || savingFamilyAttr}
                            onClick={() => form.id && addFamilyAttr(form.id)}
                            style={{ whiteSpace: "nowrap", height: "36px" }}
                          >
                            <Plus size={14} />{" "}
                            {savingFamilyAttr ? "Asignando…" : "Asignar"}
                          </button>
                        </div>

                        <div
                          className="catalog-table-wrap"
                          style={{ maxHeight: "220px", overflowY: "auto" }}
                        >
                          <table
                            className="catalog-table"
                            style={{ minWidth: "100%" }}
                          >
                            <thead>
                              <tr>
                                <th style={{ width: "35px" }}>#</th>
                                <th>Código</th>
                                <th>Característica</th>
                                <th>Tipo</th>
                                <th style={{ textAlign: "center" }}>
                                  Obligatorio
                                </th>
                                <th style={{ width: "40px" }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {familyAttributes.length === 0 ? (
                                <tr>
                                  <td
                                    colSpan={6}
                                    style={{
                                      textAlign: "center",
                                      padding: "14px",
                                      color: "#64748b",
                                      fontSize: "12px",
                                    }}
                                  >
                                    No hay características asignadas a esta
                                    familia.
                                  </td>
                                </tr>
                              ) : (
                                familyAttributes.map((fa, idx) => (
                                  <tr key={fa.assignment_id}>
                                    <td>{idx + 1}</td>
                                    <td style={{ fontWeight: 600 }}>
                                      {fa.code}
                                    </td>
                                    <td>{fa.name}</td>
                                    <td>
                                      <span
                                        style={{
                                          fontSize: "11px",
                                          background: "#efeee9",
                                          padding: "2px 6px",
                                          borderRadius: "4px",
                                        }}
                                      >
                                        {fa.data_type}
                                      </span>
                                    </td>
                                    <td style={{ textAlign: "center" }}>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleFamilyAttrRequired(fa)
                                        }
                                        className={`status ${fa.required ? "active" : "inactive"}`}
                                        style={{
                                          cursor: "pointer",
                                          border: "none",
                                          background: "transparent",
                                          padding: "2px 6px",
                                          fontWeight: 600,
                                        }}
                                        title="Haz clic para alternar Obligatorio / Opcional"
                                      >
                                        {fa.required ? "Sí" : "No"}
                                      </button>
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className="icon-action danger"
                                        style={{
                                          width: "28px",
                                          height: "28px",
                                        }}
                                        title="Quitar característica de la familia"
                                        onClick={() => removeFamilyAttr(fa)}
                                      >
                                        <Trash2 size={13} />
                                      </button>
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
                </>
              )}

              {kind === "attributes" && (
                <label>
                  Tipo de dato
                  <select
                    value={form.data_type}
                    onChange={(e) =>
                      setForm({ ...form, data_type: e.target.value })
                    }
                  >
                    <option value="TEXT">Texto</option>
                    <option value="NUMBER">Número</option>
                    <option value="BOOLEAN">Booleano</option>
                    <option value="OPTION">Opción</option>
                  </select>
                </label>
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

        {kind === "attributes" && selectedAttribute && (
          <aside className="panel catalog-editor">
            <div className="panel-head">
              <div>
                <h2>Valores</h2>
                <p>
                  {selectedAttribute.code} · {selectedAttribute.name}
                </p>
              </div>
              <button
                className="icon-action"
                onClick={() => setSelectedAttribute(null)}
                title="Cerrar"
              >
                <X size={17} />
              </button>
            </div>
            <div className="form-grid">
              <label>
                Código
                <input
                  value={valueForm.code}
                  onChange={(e) =>
                    setValueForm({ ...valueForm, code: e.target.value })
                  }
                />
              </label>
              <label>
                Nombre
                <input
                  value={valueForm.name}
                  onChange={(e) =>
                    setValueForm({ ...valueForm, name: e.target.value })
                  }
                />
              </label>
              <label>
                Orden
                <input
                  type="number"
                  value={valueForm.sort_order}
                  onChange={(e) =>
                    setValueForm({
                      ...valueForm,
                      sort_order: Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>
            <div className="actions">
              <button
                className="primary-button"
                disabled={saving}
                onClick={saveValue}
              >
                <Save size={15} /> Guardar valor
              </button>
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
                  {attributeValues.map((v) => (
                    <tr key={v.id}>
                      <td>{v.code}</td>
                      <td>{v.name}</td>
                      <td>
                        {v.deleted_at
                          ? "Marcado para borrado"
                          : v.active
                            ? "Activo"
                            : "Inactivo"}
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
                  ))}
                </tbody>
              </table>
            </div>
          </aside>
        )}

        {kind === "attributes" && selectedAttributeForColors && (
          <aside className="panel catalog-editor">
            <div className="panel-head">
              <div>
                <h2>Colores</h2>
                <p>
                  {selectedAttributeForColors.code} · {selectedAttributeForColors.name}
                </p>
              </div>
              <button
                className="icon-action"
                onClick={closeAttributeColors}
                title="Cerrar"
              >
                <X size={17} />
              </button>
            </div>
            {colorPanelError && <div className="inline-error">{colorPanelError}</div>}
            <p className="form-help">
              Familia y artículo heredarán este conjunto de colores, pudiendo excluir los
              que no apliquen en cada caso.
            </p>
            <div className="form-grid">
              <label className="wide">
                Añadir color
                <div style={{ display: "flex", gap: "8px" }}>
                  <select
                    value={colorToAddId}
                    onChange={(e) => setColorToAddId(e.target.value)}
                  >
                    <option value="">Selecciona un color…</option>
                    {availableColorsToAdd.map((color) => (
                      <option key={color.id} value={color.id}>
                        {color.code} · {color.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!colorToAddId || colorPanelBusy}
                    onClick={addColorToAttribute}
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
                  {attributeColors.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="empty">
                        Sin colores asociados a esta característica.
                      </td>
                    </tr>
                  ) : (
                    attributeColors.map((ac) => (
                      <tr key={ac.id}>
                        <td>{ac.color?.code ?? "—"}</td>
                        <td>{ac.color?.name ?? "—"}</td>
                        <td>
                          <div className="item-actions">
                            <button
                              className="icon-action danger"
                              title="Quitar"
                              disabled={colorPanelBusy}
                              onClick={() => removeColorFromAttribute(ac)}
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
          </aside>
        )}
      </div>
    </div>
  );
}
