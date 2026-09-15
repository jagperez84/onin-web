import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { sanitizeSearchTerm } from '../core/searchSanitize';
import {
  evaluateFormula,
  evaluateOtdComponent,
  resolveOtdVariables,
  type FormulaEvaluationContext,
  type OtdComponentFormula,
  type OtdVariableDefinition,
} from './formulaEngine';
import { resolveProductUnitPrice, round2 } from '../catalog/productPricingService';
import { listOtdScales, resolveOtdBasePriceFromScales, type OtdScaleRow } from './otdScaleRepository';
import type { Product } from '../catalog/productRepository';
import type { ProductScaleRow } from '../catalog/productCommercialRepository';
import { listUnits, type Unit } from '../catalog/unitRepository';
import {
  listUnitConversions,
  convertUnitValue,
  type UnitConversion,
  IncompatibleUnitMagnitudeError,
} from '../catalog/unitConversionRepository';

export type OtdModel = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  template_type: string | null;
  work_unit_id?: number | null;
  work_unit?: Unit | null;
  active: boolean;
  product_id?: number | null;
  version?: number;
};

export type OtdSelectionOption = {
  id: number;
  selection_id: number;
  code: string;
  label: string;
  value: string | null;
  sort_order: number;
};

export type OtdSelection = {
  id: number;
  otd_id: number;
  code: string;
  name: string;
  selection_type: 'NUMBER' | 'OPTION' | 'TEXT' | 'BOOLEAN';
  required: boolean;
  is_dimension?: boolean;
  unit_id?: number | null;
  unit?: Unit | null;
  sort_order: number;
  options: OtdSelectionOption[];
};

export type OtdVariable = OtdVariableDefinition & {
  id: number;
  otd_id: number;
  name: string;
  min_value: number | null;
  max_value: number | null;
  sort_order: number;
};

export type OtdDimensionDef = {
  code: string;
  name: string;
  dimension_number: number;
  unit_id: number | null;
  unit_code?: string;
  unit_name?: string;
  unit_symbol?: string | null;
  decimals: number;
};

export type OtdScale = ProductScaleRow & { product_id: number };

export type OtdColorOption = { id: number; code: string; name: string; hex: string | null };

/**
 * "Característica" a efectos de OTD = product_attribute (familia + asignación de
 * artículo, la única pantalla real donde se puede dar de alta una característica
 * con colores — ver ProductFamilyCharacteristicsPanel). product_characteristic no
 * tiene ninguna pantalla que la enlace desde la ficha del artículo, así que nunca
 * hay datos reales ahí; por eso el motor de OTD ya no la usa.
 */
export type OtdCharacteristicOption = {
  id: number;
  code: string;
  description: string | null;
  colors: OtdColorOption[];
};

export type OtdComponentDef = OtdComponentFormula & {
  id: number;
  otd_id: number;
  product_id: number | null;
  description: string | null;
  component_type: 'BASIC' | 'IMPROVEMENT';
  characteristic_id: number | null;
  characteristic_expression: string | null;
  color_id: number | null;
  color_expression: string | null;
  price_increment: number;
  price_increment_type: 'FIXED' | 'PERCENTAGE';
  unit_id?: number | null;
  unit?: Unit | null;
  active: boolean;
  sort_order: number;
  // Hydrated data
  product?: Product | null;
  dimensions?: OtdDimensionDef[];
  scales?: OtdScale[];
  characteristics?: OtdCharacteristicOption[];
};

export type OtdRuntimeData = {
  otd: OtdModel;
  selections: OtdSelection[];
  variables: OtdVariable[];
  components: OtdComponentDef[];
  scales: OtdScaleRow[];
  productsMap: Map<number, Product>;
  unitsMap: Map<number, Unit>;
  conversions: UnitConversion[];
  workUnit: Unit | null;
  /** Unión de colores por característica (attribute_id -> colores), solo para el selector "aplicar a todos" y el listado global de colores del OTD — nunca para resolver el color de un componente concreto (usar comp.characteristics, que respeta las exclusiones de cada artículo/familia). */
  colorsByCharacteristic: Map<number, OtdColorOption[]>;
  loadedAt: string;
};

export type OtdCalculatedComponent = {
  id: number;
  code: string;
  description: string;
  product_id: number | null;
  product_code: string;
  product_name: string;
  component_type: 'BASIC' | 'IMPROVEMENT';
  unit_id: number | null;
  unit_code: string | null;
  unit_symbol: string | null;
  quantity: number;
  quantity_expression: string | null;
  dimensions: Record<string, number>;
  dimension_expressions: Record<string, string>;
  dimension_list: Array<{
    code: string;
    name: string;
    value: number;
    unit_id?: number | null;
    unit_code?: string;
    unit_symbol?: string | null;
    raw_value?: number;
    raw_unit_code?: string;
    raw_unit_symbol?: string | null;
  }>;
  characteristic_id: number | null;
  characteristic_code: string | null;
  characteristic_name: string | null;
  characteristic_expression: string | null;
  color_id: number | null;
  color_code: string | null;
  color_name: string | null;
  color_hex: string | null;
  /** De dónde salió el color: 'fixed'/'formula' vienen del propio OTD (no editable al configurar); 'manual' es la elección del usuario (desplegable propio o selector maestro), siempre editable aunque ya tenga valor. null si no se resolvió ninguno. */
  color_source: 'fixed' | 'formula' | 'manual' | null;
  /** Colores disponibles para este componente, ya filtrados por artículo/familia. Vacío si su característica no diferencia por color o no se resolvió ninguna. */
  available_colors: OtdColorOption[];
  pricing_source: 'base' | 'characteristic' | 'scale' | 'scale_characteristic' | 'manual';
  scale_step_used: {
    dimension_1: number;
    dimension_2: number | null;
    price: number;
  } | null;
  base_price: number;
  price_increment: number;
  price_increment_type: 'FIXED' | 'PERCENTAGE';
  increment_amount: number;
  unit_price: number;
  total_price: number;
  ok: boolean;
  formula_error?: string;
};

export type OtdCalculationResult = {
  inputs: Record<string, string | number | boolean | null>;
  resolvedVariables: FormulaEvaluationContext;
  components: OtdCalculatedComponent[];
  otdBasePrice: number;
  otdScaleStepUsed: {
    dimension_1: number;
    dimension_2: number | null;
    price: number;
  } | null;
  totalIncrements: number;
  totalAmount: number;
  isValid: boolean;
  requiredMissing: string[];
  errors: string[];
};

export type OtdSnapshotComponent = {
  id?: number;
  product_id: number | null;
  product_code: string;
  product_name: string;
  component_type: 'BASIC' | 'IMPROVEMENT';
  unit_id?: number | null;
  unit_code?: string | null;
  unit_symbol?: string | null;
  quantity: number;
  quantity_expression: string | null;
  dimensions: Record<string, number>;
  dimension_expressions: Record<string, string>;
  dimension_list: Array<{
    code: string;
    name: string;
    value: number;
    unit_id?: number | null;
    unit_code?: string;
    unit_symbol?: string | null;
    raw_value?: number;
    raw_unit_code?: string;
    raw_unit_symbol?: string | null;
  }>;
  characteristic_id: number | null;
  characteristic_code: string | null;
  characteristic_name: string | null;
  characteristic_expression: string | null;
  color_id: number | null;
  color_code: string | null;
  color_name: string | null;
  color_hex: string | null;
  pricing_source: 'base' | 'characteristic' | 'scale' | 'scale_characteristic' | 'manual';
  scale_step_used: {
    dimension_1: number;
    dimension_2: number | null;
    price: number;
  } | null;
  base_price: number;
  price_increment: number;
  price_increment_type: 'FIXED' | 'PERCENTAGE';
  increment_amount: number;
  unit_price: number;
  total_price: number;
  is_missing_price: boolean;
  missing_reason?: string;
};

export type OtdConfigurationSnapshot = {
  snapshot_version: '1.0';
  created_at: string;
  otd_id: number;
  otd_code: string;
  otd_name: string;
  template_type: string | null;
  work_unit_id?: number | null;
  work_unit_code?: string | null;
  work_unit_name?: string | null;
  work_unit_symbol?: string | null;
  work_unit?: {
    id: number;
    code: string;
    name: string;
    symbol?: string | null;
  } | null;
  inputs: Record<string, string | number | boolean | null>;
  inputs_display: Array<{
    code: string;
    name: string;
    value: string | number | boolean | null;
    display_value: string;
    is_dimension?: boolean;
    unit_id?: number | null;
    unit_code?: string;
    unit_symbol?: string | null;
  }>;
  dimensions?: Array<{
    code: string;
    name: string;
    value: number | null;
    unit_code?: string;
    unit_id?: number | null;
    unit_name?: string;
    unit_symbol?: string | null;
  }>;
  variables: Record<string, number>;
  variables_display: Array<{
    code: string;
    name: string;
    value: number;
    expression: string | null;
  }>;
  otd_base_price: number;
  otd_scale_step_used: {
    dimension_1: number;
    dimension_2: number | null;
    price: number;
  } | null;
  total_increments: number;
  components: OtdSnapshotComponent[];
  total_amount: number;
  notes?: string;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está inicializado.');
  return supabase;
}

/**
 * Características efectivas (product_attribute, heredadas de familia + asignación
 * propia del artículo, con exclusiones) y sus colores disponibles, para un lote de
 * artículos. Reproduce en bloque la misma fusión que listProductCharacteristicConfiguration
 * + listEffectiveAttributeColors hacen por artículo, para no lanzar N llamadas por
 * componente del OTD.
 */
export async function loadEffectiveCharacteristicsForProducts(
  c: ReturnType<typeof client>,
  products: Array<{ id: number; family_id?: number | null }>
): Promise<{
  byProduct: Map<number, OtdCharacteristicOption[]>;
  colorsByCharacteristic: Map<number, OtdColorOption[]>;
}> {
  const productIds = products.map(p => p.id);
  if (productIds.length === 0) return { byProduct: new Map(), colorsByCharacteristic: new Map() };

  const familyIds = [
    ...new Set(products.map(p => p.family_id).filter((id): id is number => Number.isFinite(id))),
  ];

  const [familyAttrsRes, articleAssignRes, exclusionsRes] = await Promise.all([
    familyIds.length > 0
      ? c
          .from('product_family_attribute')
          .select('id,family_id,attribute_id,product_attribute!inner(id,code,name)')
          .in('family_id', familyIds)
          .eq('active', true)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as any[], error: null }),
    c
      .from('product_attribute_assignment')
      .select('id,product_id,attribute_id,product_attribute!inner(id,code,name)')
      .in('product_id', productIds)
      .eq('active', true)
      .is('deleted_at', null),
    c.from('product_family_attribute_exclusion').select('product_id,attribute_id').in('product_id', productIds),
  ]);

  const attrOf = (v: any): any => (Array.isArray(v) ? v[0] ?? null : v ?? null);

  const familyAttrsByFamily = new Map<number, any[]>();
  for (const r of (familyAttrsRes.data ?? []) as any[]) {
    const fid = Number(r.family_id);
    const list = familyAttrsByFamily.get(fid) ?? [];
    list.push(r);
    familyAttrsByFamily.set(fid, list);
  }
  const articleRowsByProduct = new Map<number, any[]>();
  for (const r of (articleAssignRes.data ?? []) as any[]) {
    const pid = Number(r.product_id);
    const list = articleRowsByProduct.get(pid) ?? [];
    list.push(r);
    articleRowsByProduct.set(pid, list);
  }
  const exclusionsByProduct = new Map<number, Set<number>>();
  for (const r of (exclusionsRes.data ?? []) as any[]) {
    const pid = Number(r.product_id);
    const set = exclusionsByProduct.get(pid) ?? new Set<number>();
    set.add(Number(r.attribute_id));
    exclusionsByProduct.set(pid, set);
  }

  type EffectiveRow = { attribute_id: number; code: string; name: string; source: 'family' | 'article'; assignment_id: number };
  const effectiveByProduct = new Map<number, Map<number, EffectiveRow>>();

  for (const p of products) {
    const map = new Map<number, EffectiveRow>();
    const fid = p.family_id != null && Number.isFinite(p.family_id) ? Number(p.family_id) : null;
    const excluded = exclusionsByProduct.get(p.id) ?? new Set<number>();
    if (fid != null) {
      for (const r of familyAttrsByFamily.get(fid) ?? []) {
        const attrId = Number(r.attribute_id);
        if (excluded.has(attrId)) continue;
        const attr = attrOf(r.product_attribute);
        map.set(attrId, {
          attribute_id: attrId,
          code: String(attr?.code ?? ''),
          name: String(attr?.name ?? ''),
          source: 'family',
          assignment_id: Number(r.id),
        });
      }
    }
    for (const r of articleRowsByProduct.get(p.id) ?? []) {
      const attrId = Number(r.attribute_id);
      const attr = attrOf(r.product_attribute);
      map.set(attrId, {
        attribute_id: attrId,
        code: String(attr?.code ?? ''),
        name: String(attr?.name ?? ''),
        source: 'article',
        assignment_id: Number(r.id),
      });
    }
    effectiveByProduct.set(p.id, map);
  }

  const attributeIds = new Set<number>();
  const familyAssignmentIds = new Set<number>();
  const articleAssignmentIds = new Set<number>();
  for (const map of effectiveByProduct.values()) {
    for (const row of map.values()) {
      attributeIds.add(row.attribute_id);
      if (row.source === 'family') familyAssignmentIds.add(row.assignment_id);
      else articleAssignmentIds.add(row.assignment_id);
    }
  }

  const [attrColorsRes, familyExclRes, articleExclRes] = await Promise.all([
    attributeIds.size > 0
      ? c
          .from('attribute_color')
          .select('attribute_id,color:color(id,code,name,active,hex)')
          .in('attribute_id', [...attributeIds])
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as any[], error: null }),
    familyAssignmentIds.size > 0
      ? c
          .from('product_family_attribute_color_exclusion')
          .select('family_attribute_id,color_id')
          .in('family_attribute_id', [...familyAssignmentIds])
      : Promise.resolve({ data: [] as any[], error: null }),
    articleAssignmentIds.size > 0
      ? c
          .from('product_attribute_assignment_color_exclusion')
          .select('assignment_id,color_id')
          .in('assignment_id', [...articleAssignmentIds])
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);

  const colorsByAttribute = new Map<number, OtdColorOption[]>();
  for (const row of (attrColorsRes.data ?? []) as any[]) {
    const color = row.color;
    if (!color) continue;
    const attrId = Number(row.attribute_id);
    const list = colorsByAttribute.get(attrId) ?? [];
    list.push({ id: Number(color.id), code: String(color.code), name: String(color.name), hex: color.hex ?? null });
    colorsByAttribute.set(attrId, list);
  }

  const familyExclByAssignment = new Map<number, Set<number>>();
  for (const r of (familyExclRes.data ?? []) as any[]) {
    const aid = Number(r.family_attribute_id);
    const set = familyExclByAssignment.get(aid) ?? new Set<number>();
    set.add(Number(r.color_id));
    familyExclByAssignment.set(aid, set);
  }
  const articleExclByAssignment = new Map<number, Set<number>>();
  for (const r of (articleExclRes.data ?? []) as any[]) {
    const aid = Number(r.assignment_id);
    const set = articleExclByAssignment.get(aid) ?? new Set<number>();
    set.add(Number(r.color_id));
    articleExclByAssignment.set(aid, set);
  }

  const byProduct = new Map<number, OtdCharacteristicOption[]>();
  const colorsByCharacteristic = new Map<number, OtdColorOption[]>();

  for (const [pid, map] of effectiveByProduct) {
    const list: OtdCharacteristicOption[] = [];
    for (const row of map.values()) {
      const allColors = colorsByAttribute.get(row.attribute_id) ?? [];
      const excludedSet =
        row.source === 'family'
          ? familyExclByAssignment.get(row.assignment_id) ?? new Set<number>()
          : articleExclByAssignment.get(row.assignment_id) ?? new Set<number>();
      const colors = allColors.filter(cl => !excludedSet.has(cl.id));
      list.push({ id: row.attribute_id, code: row.code, description: row.name, colors });
      // Unión de todos los artículos: solo se usa para el selector "aplicar a todos" y
      // el listado global de colores del OTD, nunca para resolver el color de un
      // componente concreto (eso usa comp.characteristics, que es exacto por artículo).
      colorsByCharacteristic.set(row.attribute_id, colors);
    }
    list.sort((a, b) => a.code.localeCompare(b.code));
    byProduct.set(pid, list);
  }

  return { byProduct, colorsByCharacteristic };
}

export async function loadOtdRuntimeData(otdId: number): Promise<OtdRuntimeData> {
  const c = client();
  const [otdRes, selRes, varRes, compRes, otdScales, latestVersionRes] = await Promise.all([
    c.from('otd').select('*').eq('id', otdId).single(),
    c.from('otd_selection').select('*, otd_selection_option(*)').eq('otd_id', otdId).order('sort_order'),
    c.from('otd_variable').select('*').eq('otd_id', otdId).eq('active', true).order('sort_order'),
    c.from('otd_component').select('*').eq('otd_id', otdId).eq('active', true).order('sort_order'),
    listOtdScales(otdId),
    c.from('otd_version').select('snapshot').eq('otd_id', otdId).order('version_number', { ascending: false }).limit(1).maybeSingle(),
  ]);

  if (otdRes.error) throw new CoreRepositoryError(otdRes.error.message);

  const companyId = Number(otdRes.data.company_id || 1);
  const snap = latestVersionRes.data?.snapshot;

  // Load all company units and conversions
  const [allUnits, allConversions] = await Promise.all([
    listUnits(companyId).catch(() => [] as Unit[]),
    listUnitConversions(companyId).catch(() => [] as UnitConversion[]),
  ]);

  const unitsMap = new Map<number, Unit>(allUnits.map(u => [Number(u.id), u]));

  const rawComps = (compRes.data ?? []) as any[];
  const productIds = [
    ...new Set(rawComps.map(x => x.product_id).filter((id): id is number => Number.isFinite(id))),
  ];

  let products: Product[] = [];
  let scales: any[] = [];
  let dimensions: any[] = [];
  let familyMap: Record<number, any> = {};
  let byProductChars = new Map<number, OtdCharacteristicOption[]>();
  let colorsByCharacteristic = new Map<number, OtdColorOption[]>();

  if (productIds.length > 0) {
    const { data: pData, error: pe } = await c.from('product').select('*').in('id', productIds);
    if (pe) throw new CoreRepositoryError(pe.message);
    products = (pData ?? []) as Product[];

    const familyIds = [
      ...new Set(products.map(p => p.family_id).filter((id): id is number => Number.isFinite(id))),
    ];
    if (familyIds.length > 0) {
      const { data: fData } = await c.from('product_family').select('id, measurement_type_id').in('id', familyIds);
      familyMap = Object.fromEntries((fData ?? []).map((f: any) => [f.id, f]));
    }

    const mtIds = [
      ...new Set(
        products
          .map(p =>
            Number.isFinite(p.measurement_type_id)
              ? p.measurement_type_id
              : familyMap[p.family_id!]?.measurement_type_id
          )
          .filter((id): id is number => Number.isFinite(id))
      ),
    ];

    if (mtIds.length > 0) {
      const { data: dData } = await c
        .from('measurement_type_dimension')
        .select('measurement_type_id, dimension_number, code, name, unit_id, decimals')
        .in('measurement_type_id', mtIds)
        .order('dimension_number');
      dimensions = dData ?? [];
    }

    const [scalesRes, effectiveChars] = await Promise.all([
      c
        .from('product_scale')
        .select('id, product_id, dimension_values, dimension_1, dimension_2, price, characteristic_id, attribute_values, deleted_at, deleted_by')
        .in('product_id', productIds)
        .is('deleted_at', null)
        .order('dimension_1')
        .order('dimension_2'),
      loadEffectiveCharacteristicsForProducts(
        c,
        products.map(p => ({ id: Number(p.id), family_id: p.family_id != null ? Number(p.family_id) : null })),
      ),
    ]);

    scales = scalesRes.data ?? [];
    byProductChars = effectiveChars.byProduct;
    colorsByCharacteristic = effectiveChars.colorsByCharacteristic;
  }

  const productsMap = new Map<number, Product>(products.map(p => [Number(p.id), p]));

  const byProductScales = new Map<number, OtdScale[]>();
  for (const r of scales) {
    const pid = Number(r.product_id);
    const list = byProductScales.get(pid) ?? [];
    list.push({
      ...r,
      product_id: pid,
      // dimension_1/dimension_2 are the columns the scale editors actually
      // maintain; dimension_values can go stale when a row is edited after
      // creation, so it must never be trusted over the two source columns.
      dimension_values: [Number(r.dimension_1), ...(r.dimension_2 == null ? [] : [Number(r.dimension_2)])],
      attribute_values: r.attribute_values && typeof r.attribute_values === 'object' ? r.attribute_values : {},
    });
    byProductScales.set(pid, list);
  }

  const getDimensionsForProduct = (p: Product): OtdDimensionDef[] => {
    const mtId = Number.isFinite(p.measurement_type_id)
      ? p.measurement_type_id
      : familyMap[p.family_id!]?.measurement_type_id ?? null;
    if (mtId == null) return [];
    return dimensions
      .filter((d: any) => Number(d.measurement_type_id) === Number(mtId))
      .map((d: any) => {
        const uId = d.unit_id == null ? null : Number(d.unit_id);
        const uObj = uId ? unitsMap.get(uId) : null;
        return {
          code: String(d.code),
          name: String(d.name),
          dimension_number: Number(d.dimension_number),
          unit_id: uId,
          unit_code: uObj?.code || undefined,
          unit_name: uObj?.name || undefined,
          unit_symbol: uObj?.symbol || uObj?.code || undefined,
          decimals: Number(d.decimals ?? 0),
        };
      });
  };

  const rawWorkUnitId =
    otdRes.data.work_unit_id != null
      ? Number(otdRes.data.work_unit_id)
      : snap?.otd?.work_unit_id != null
        ? Number(snap.otd.work_unit_id)
        : null;

  const workUnit = rawWorkUnitId ? unitsMap.get(rawWorkUnitId) ?? null : null;

  const otdModel: OtdModel = {
    ...(otdRes.data as any),
    work_unit_id: rawWorkUnitId,
    work_unit: workUnit,
  };

  const selections: OtdSelection[] = (selRes.data ?? []).map((x: any, idx: number) => {
    const snapSel = snap?.selections?.[idx];
    const selUnitId =
      x.unit_id != null
        ? Number(x.unit_id)
        : snapSel?.unit_id != null
          ? Number(snapSel.unit_id)
          : null;
    const isDim = Boolean(x.is_dimension ?? snapSel?.is_dimension);
    const selUnit = selUnitId ? unitsMap.get(selUnitId) ?? null : (isDim ? workUnit : null);
    return {
      id: Number(x.id),
      otd_id: Number(x.otd_id),
      code: String(x.code || ''),
      name: String(x.name || x.code || ''),
      selection_type: x.selection_type || 'NUMBER',
      required: Boolean(x.required),
      is_dimension: isDim,
      unit_id: selUnitId,
      unit: selUnit,
      sort_order: Number(x.sort_order ?? 0),
      options: (x.otd_selection_option ?? []).map((o: any) => ({
        id: Number(o.id),
        selection_id: Number(o.selection_id),
        code: String(o.code || ''),
        label: String(o.label || o.code || ''),
        value: o.value != null ? String(o.value) : null,
        sort_order: Number(o.sort_order ?? 0),
      })),
    };
  });

  const variables: OtdVariable[] = (varRes.data ?? []).map((v: any) => ({
    id: Number(v.id),
    otd_id: Number(v.otd_id),
    code: String(v.code || ''),
    name: String(v.name || v.code || ''),
    expression: v.expression || null,
    data_type: v.data_type || 'NUMBER',
    min_value: v.min_value == null ? null : Number(v.min_value),
    max_value: v.max_value == null ? null : Number(v.max_value),
    sort_order: Number(v.sort_order ?? 0),
    active: Boolean(v.active),
  }));

  const components: OtdComponentDef[] = rawComps.map((c: any, idx: number) => {
    const snapComp = snap?.components?.[idx];
    const prod = c.product_id ? productsMap.get(Number(c.product_id)) ?? null : null;
    const cUnitId =
      c.unit_id != null
        ? Number(c.unit_id)
        : snapComp?.unit_id != null
          ? Number(snapComp.unit_id)
          : (prod?.base_unit_id ? Number(prod.base_unit_id) : null);
    const cUnit = cUnitId ? unitsMap.get(cUnitId) ?? null : null;

    return {
      id: Number(c.id),
      otd_id: Number(c.otd_id),
      code: String(c.code || ''),
      product_id: c.product_id ? Number(c.product_id) : null,
      description: c.description || null,
      component_type: c.component_type === 'IMPROVEMENT' ? 'IMPROVEMENT' : 'BASIC',
      quantity_expression: c.quantity_expression || null,
      dimension_expressions:
        c.dimension_expressions && typeof c.dimension_expressions === 'object'
          ? c.dimension_expressions
          : {},
      characteristic_id: c.characteristic_id ? Number(c.characteristic_id) : null,
      characteristic_expression: c.characteristic_expression || null,
      color_id: c.color_id ? Number(c.color_id) : null,
      color_expression: c.color_expression || null,
      price_increment: Number(c.price_increment ?? 0),
      price_increment_type: c.price_increment_type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED',
      unit_id: cUnitId,
      unit: cUnit,
      active: Boolean(c.active),
      sort_order: Number(c.sort_order ?? 0),
      product: prod,
      dimensions: prod ? getDimensionsForProduct(prod) : [],
      scales: prod ? byProductScales.get(Number(prod.id)) ?? [] : [],
      characteristics: prod ? byProductChars.get(Number(prod.id)) ?? [] : [],
    };
  });

  return {
    otd: otdModel,
    selections,
    variables,
    components,
    scales: otdScales,
    productsMap,
    unitsMap,
    conversions: allConversions,
    workUnit,
    colorsByCharacteristic,
    loadedAt: new Date().toISOString(),
  };
}

export async function fetchProductForOtdComponent(productId: number): Promise<{
  product: Product;
  dimensions: OtdDimensionDef[];
  scales: OtdScale[];
  characteristics: OtdCharacteristicOption[];
}> {
  const c = client();
  const { data: prod, error: pe } = await c.from('product').select('*').eq('id', productId).single();
  if (pe || !prod) throw new CoreRepositoryError(pe?.message || 'Producto no encontrado');

  const companyId = Number(prod.company_id || 1);
  const allUnits = await listUnits(companyId).catch(() => [] as Unit[]);
  const unitsMap = new Map<number, Unit>(allUnits.map(u => [Number(u.id), u]));

  let dimensions: OtdDimensionDef[] = [];
  let familyMeasurementTypeId: number | null = null;
  if (prod.family_id) {
    const { data: fData } = await c
      .from('product_family')
      .select('measurement_type_id')
      .eq('id', prod.family_id)
      .single();
    if (fData?.measurement_type_id) {
      familyMeasurementTypeId = Number(fData.measurement_type_id);
    }
  }

  const mtId = Number.isFinite(prod.measurement_type_id)
    ? prod.measurement_type_id
    : familyMeasurementTypeId;

  if (mtId) {
    const { data: dData } = await c
      .from('measurement_type_dimension')
      .select('measurement_type_id, dimension_number, code, name, unit_id, decimals')
      .eq('measurement_type_id', mtId)
      .order('dimension_number');
    if (dData) {
      dimensions = dData.map((d: any) => {
        const uId = d.unit_id == null ? null : Number(d.unit_id);
        const uObj = uId ? unitsMap.get(uId) : null;
        return {
          code: String(d.code),
          name: String(d.name),
          dimension_number: Number(d.dimension_number),
          unit_id: uId,
          unit_code: uObj?.code || undefined,
          unit_name: uObj?.name || undefined,
          unit_symbol: uObj?.symbol || uObj?.code || undefined,
          decimals: Number(d.decimals ?? 0),
        };
      });
    }
  }

  const [scalesRes, effectiveChars] = await Promise.all([
    c
      .from('product_scale')
      .select(
        'id, product_id, dimension_values, dimension_1, dimension_2, price, characteristic_id, attribute_values, deleted_at, deleted_by'
      )
      .eq('product_id', productId)
      .is('deleted_at', null)
      .order('dimension_1')
      .order('dimension_2'),
    loadEffectiveCharacteristicsForProducts(c, [
      { id: productId, family_id: prod.family_id != null ? Number(prod.family_id) : null },
    ]),
  ]);

  const scales: OtdScale[] = (scalesRes.data ?? []).map((r: any) => ({
    ...r,
    product_id: productId,
    // dimension_1/dimension_2 are the columns the scale editors actually
    // maintain; dimension_values can go stale when a row is edited after
    // creation, so it must never be trusted over the two source columns.
    dimension_values: [Number(r.dimension_1), ...(r.dimension_2 == null ? [] : [Number(r.dimension_2)])],
    attribute_values:
      r.attribute_values && typeof r.attribute_values === 'object' ? r.attribute_values : {},
  }));

  const characteristics = effectiveChars.byProduct.get(productId) ?? [];

  return {
    product: prod as Product,
    dimensions,
    scales,
    characteristics,
  };
}

export function calculateOtdRuntime(
  runtimeData: OtdRuntimeData,
  rawValues: Record<string, string | number | boolean | null>,
  colorSelections: Record<string, number | null> = {}
): OtdCalculationResult {
  const { selections, variables, components, scales } = runtimeData;
  const errors: string[] = [];
  const requiredMissing: string[] = [];

  // 1. Process Office Inputs
  const numericInputs: FormulaEvaluationContext = {};
  const processedInputs: Record<string, string | number | boolean | null> = {};
  const dimensionInputs: number[] = [];

  for (const sel of selections) {
    const raw = rawValues[sel.code];
    const isPresent = raw !== null && raw !== undefined && String(raw).trim() !== '';

    if (sel.required && !isPresent) {
      requiredMissing.push(sel.name || sel.code);
    }

    if (sel.selection_type === 'NUMBER') {
      const numVal = Number(raw);
      if (Number.isFinite(numVal)) {
        numericInputs[sel.code] = numVal;
        processedInputs[sel.code] = numVal;
        if (sel.is_dimension) {
          dimensionInputs.push(numVal);
        }
      } else {
        processedInputs[sel.code] = null;
      }
    } else if (sel.selection_type === 'BOOLEAN') {
      const boolVal = raw === true || raw === 'true' || raw === '1' || raw === 1;
      processedInputs[sel.code] = boolVal;
      numericInputs[sel.code] = boolVal ? 1 : 0;
    } else if (sel.selection_type === 'OPTION') {
      processedInputs[sel.code] = isPresent ? String(raw) : null;

      // Find the matched option by value, code, or label
      const matchedOpt = sel.options.find(
        o =>
          (o.value != null && String(o.value).trim() === String(raw).trim()) ||
          String(o.code).trim() === String(raw).trim() ||
          String(o.label).trim() === String(raw).trim()
      );

      // Value candidates in order of priority: option value -> option code -> raw input value
      const candidates = [
        matchedOpt?.value,
        matchedOpt?.code,
        raw,
      ];

      let resolvedNumber: number | null = null;
      for (const cand of candidates) {
        if (cand !== null && cand !== undefined && String(cand).trim() !== '') {
          const s = String(cand).trim();
          const n = Number(s);
          if (Number.isFinite(n)) {
            resolvedNumber = n;
            break;
          }
          if (s.toUpperCase() === 'SI' || s.toUpperCase() === 'SÍ' || s.toUpperCase() === 'TRUE') {
            resolvedNumber = 1;
            break;
          }
          if (s.toUpperCase() === 'NO' || s.toUpperCase() === 'FALSE') {
            resolvedNumber = 0;
            break;
          }
        }
      }

      if (resolvedNumber !== null) {
        numericInputs[sel.code] = resolvedNumber;
      }
    } else {
      // TEXT
      processedInputs[sel.code] = isPresent ? String(raw) : null;
      const numVal = Number(raw);
      if (Number.isFinite(numVal)) {
        numericInputs[sel.code] = numVal;
      }
    }
  }

  // 2. Resolve OTD Variables
  let resolvedVariables: FormulaEvaluationContext = { ...numericInputs };
  try {
    resolvedVariables = resolveOtdVariables(variables, numericInputs);
  } catch (err: any) {
    errors.push(`Error al resolver variables: ${err?.message || err}`);
  }

  // 3. Resolve OTD Compound Product Base Price from OTD's own scale matrix
  let otdBasePrice = 0;
  let otdScaleStepUsed: { dimension_1: number; dimension_2: number | null; price: number } | null = null;

  if (scales.length > 0) {
    const scaleResolution = resolveOtdBasePriceFromScales(scales, dimensionInputs);
    if (scaleResolution.found) {
      otdBasePrice = scaleResolution.basePrice;
      otdScaleStepUsed = scaleResolution.scaleStep;
    } else if (dimensionInputs.length > 0) {
      errors.push('No se encontró escalón de precio en la matriz del OTD para las medidas seleccionadas.');
    }
  }

  // 4. Evaluate Components
  const calculatedComponents: OtdCalculatedComponent[] = [];

  for (const comp of components) {
    if (!comp.active) continue;

    const prod = comp.product;
    const prodCode = prod?.code || comp.code;
    const prodName =
      prod?.commercial_description || prod?.technical_description || comp.description || comp.code;

    try {
      // Quantity resolution
      const qtyRes = evaluateFormula(comp.quantity_expression || '1', resolvedVariables);
      const quantity = Math.max(0, qtyRes.value);

      // Dimensions resolution
      const dimensions: Record<string, number> = {};
      const dimensionList: Array<{
        code: string;
        name: string;
        value: number;
        unit_id?: number | null;
        unit_code?: string;
        unit_symbol?: string | null;
        raw_value?: number;
        raw_unit_code?: string;
      }> = [];

      for (const [dimCode, expr] of Object.entries(comp.dimension_expressions ?? {})) {
        if (!expr || !expr.trim()) continue;
        const dimRes = evaluateFormula(expr, resolvedVariables);
        const rawVal = Math.max(0, dimRes.value);

        const dimDef = (comp.dimensions ?? []).find(d => d.code === dimCode);
        const targetUnitId = dimDef?.unit_id ?? null;
        const targetUnit = targetUnitId ? runtimeData.unitsMap.get(targetUnitId) ?? null : null;

        // Check if expression points directly to a selection input
        const matchingSelection = selections.find(s => s.code === expr.trim());
        const sourceUnit =
          matchingSelection?.unit ??
          (matchingSelection?.unit_id ? runtimeData.unitsMap.get(matchingSelection.unit_id) ?? null : null) ??
          runtimeData.workUnit ??
          null;

        let convertedVal = rawVal;
        if (sourceUnit && targetUnit && (sourceUnit.id !== targetUnit.id || sourceUnit.code !== targetUnit.code)) {
          try {
            convertedVal = convertUnitValue({
              value: rawVal,
              fromUnit: sourceUnit,
              toUnit: targetUnit,
              conversions: runtimeData.conversions,
              unitsMap: runtimeData.unitsMap,
            });
          } catch (convErr: any) {
            console.warn(`Error converting dimension ${dimCode} for component ${comp.code}:`, convErr);
          }
        }

        dimensions[dimCode] = convertedVal;

        dimensionList.push({
          code: dimCode,
          name: dimDef?.name || dimCode,
          value: convertedVal,
          unit_id: targetUnit?.id ?? sourceUnit?.id ?? null,
          unit_code: targetUnit?.code ?? sourceUnit?.code ?? undefined,
          unit_symbol: targetUnit?.symbol ?? sourceUnit?.symbol ?? targetUnit?.code ?? sourceUnit?.code ?? undefined,
          raw_value: rawVal,
          raw_unit_code: sourceUnit?.code ?? undefined,
        });
      }

      // Ordered dimensions according to product measurement type (dim1, dim2)
      const orderedDimensions = (comp.dimensions ?? []).map(d => dimensions[d.code] ?? null);

      // Characteristic resolution (Fixed vs Dynamic)
      let resolvedChar: OtdCharacteristicOption | null = null;

      if (comp.characteristic_id) {
        resolvedChar =
          (comp.characteristics ?? []).find(ch => ch.id === comp.characteristic_id) ?? null;
      } else if (comp.characteristic_expression && comp.characteristic_expression.trim()) {
        const expr = comp.characteristic_expression.trim();
        // Look up variable or input value
        const charValue =
          processedInputs[expr] ??
          rawValues[expr] ??
          (Number.isFinite(resolvedVariables[expr]) ? String(resolvedVariables[expr]) : expr);

        if (charValue !== null && charValue !== undefined && String(charValue).trim() !== '') {
          const searchStr = String(charValue).trim().toUpperCase();
          resolvedChar =
            (comp.characteristics ?? []).find(
              ch =>
                String(ch.id) === searchStr ||
                ch.code.toUpperCase() === searchStr ||
                (ch.description && ch.description.toUpperCase() === searchStr)
            ) ?? null;
        }
      }

      // Resolución de color: si la característica resuelta agrupa colores
      // (attribute_color, vía comp.characteristics — ya filtrado por las
      // exclusiones propias de este artículo o su familia), el componente puede
      // fijar uno en el propio OTD (color_id), resolverlo dinámicamente
      // (color_expression, igual que characteristic_expression) o, si no se
      // definió ninguno de los dos, pedirlo al usuario en el propio formulario de
      // configuración (colorSelections). El precio no depende del color, solo de
      // la característica, así que esto nunca cambia basePrice.
      //
      // Importante: se usa resolvedChar.colors (ya resuelto por artículo), no el
      // mapa global runtimeData.colorsByCharacteristic — el mismo attribute_id
      // puede tener distintas exclusiones de color en cada artículo/familia, así
      // que ese mapa global (pensado solo para el selector "aplicar a todos" y el
      // listado de colores del OTD) no es válido para resolver el color de un
      // componente concreto.
      const availableColors = resolvedChar?.colors ?? [];
      let resolvedColorId: number | null = null;
      let resolvedColorCode: string | null = null;
      let resolvedColorName: string | null = null;
      let resolvedColorHex: string | null = null;
      // Distingue de dónde salió el color, para que la UI sepa si puede
      // seguir ofreciendo el desplegable manual: 'fixed'/'formula' vienen del
      // propio OTD (no hace falta ni tiene sentido dejar elegir otro color al
      // configurar); 'manual' es el mismo mecanismo de siempre (colorSelections,
      // alimentado por el desplegable propio del componente o por el selector
      // maestro) y debe seguir siendo editable aunque en este cálculo concreto
      // ya tenga un valor.
      let resolvedColorSource: 'fixed' | 'formula' | 'manual' | null = null;

      if (comp.color_id) {
        const fixed = availableColors.find(cl => cl.id === Number(comp.color_id)) ?? null;
        if (fixed) {
          resolvedColorId = fixed.id;
          resolvedColorCode = fixed.code;
          resolvedColorName = fixed.name;
          resolvedColorHex = fixed.hex;
          resolvedColorSource = 'fixed';
        }
      } else if (comp.color_expression && comp.color_expression.trim()) {
        const expr = comp.color_expression.trim();
        const colorValue =
          processedInputs[expr] ??
          rawValues[expr] ??
          (Number.isFinite(resolvedVariables[expr]) ? String(resolvedVariables[expr]) : expr);

        if (colorValue !== null && colorValue !== undefined && String(colorValue).trim() !== '') {
          const searchStr = String(colorValue).trim().toUpperCase();
          const matched =
            availableColors.find(
              cl => String(cl.id) === searchStr || cl.code.toUpperCase() === searchStr || cl.name.toUpperCase() === searchStr
            ) ?? null;
          if (matched) {
            resolvedColorId = matched.id;
            resolvedColorCode = matched.code;
            resolvedColorName = matched.name;
            resolvedColorHex = matched.hex;
            resolvedColorSource = 'formula';
          }
        }
      }

      if (!resolvedColorId && availableColors.length > 0) {
        const rawColorId = colorSelections[String(comp.id)];
        const matched =
          rawColorId != null ? availableColors.find(cl => cl.id === Number(rawColorId)) ?? null : null;
        if (matched) {
          resolvedColorId = matched.id;
          resolvedColorCode = matched.code;
          resolvedColorName = matched.name;
          resolvedColorHex = matched.hex;
          resolvedColorSource = 'manual';
        } else {
          requiredMissing.push(`Color de ${comp.description || comp.code}`);
        }
      }

      // Pricing logic:
      // If OTD has its own scale, the component only increases the base price if it has price_increment > 0.
      // If OTD does not have its own scale (legacy mode), fallback to resolving article unit price.
      let basePrice = 0;
      let pricingSource: 'base' | 'characteristic' | 'scale' | 'scale_characteristic' | 'manual' = 'base';
      let scaleStepUsed: { dimension_1: number; dimension_2: number | null; price: number } | null = null;
      let ok = true;
      let formulaError: string | undefined = undefined;

      if (scales.length > 0) {
        // OTD Direct Scaling model:
        // Components without incremental price don't add to base price.
        basePrice = 0;
        pricingSource = 'manual';
      } else {
        // Fallback: Component article scaling
        if (prod) {
          // resolvedChar ahora es una característica de tipo product_attribute
          // (ver OtdCharacteristicOption): no tiene forma de product_characteristic
          // (pvp, price_increment) ni encaja con product_scale.characteristic_id,
          // así que este fallback de precio por artículo no la usa — solo aplica
          // cuando el OTD no tiene escalado propio.
          const pricingRes = resolveProductUnitPrice({
            product: prod,
            characteristic: null,
            dimension1: orderedDimensions[0] ?? null,
            dimension2: orderedDimensions[1] ?? null,
            scales: comp.scales ?? [],
            selectedAttributeValues: {},
          });

          basePrice = pricingRes.price;
          pricingSource = pricingRes.source;
          if (pricingRes.scale) {
            scaleStepUsed = {
              dimension_1: Number(pricingRes.scale.dimension_1),
              dimension_2: pricingRes.scale.dimension_2 != null ? Number(pricingRes.scale.dimension_2) : null,
              price: Number(pricingRes.scale.price),
            };
          }

          if (pricingRes.missing) {
            ok = false;
            formulaError = pricingRes.missingReason || 'No se encontró escalado o precio para el artículo.';
          }
        } else {
          ok = false;
          formulaError = 'El componente no tiene un artículo asignado en el catálogo.';
        }
      }

      // Apply Increment (Fixed or Percentage)
      let incrementAmount = 0;
      let unitPrice = basePrice;

      const incVal = Number(comp.price_increment || 0);
      if (incVal > 0) {
        if (comp.price_increment_type === 'PERCENTAGE') {
          // If percentage and OTD has base price, calculate from OTD base price or component base price
          const refPrice = scales.length > 0 ? otdBasePrice : basePrice;
          incrementAmount = round2(refPrice * (incVal / 100));
          unitPrice = round2(basePrice + incrementAmount);
        } else {
          incrementAmount = incVal;
          unitPrice = round2(basePrice + incrementAmount);
        }
      } else {
        unitPrice = basePrice;
      }

      // Calculate Component Total
      const totalPrice = round2(unitPrice * quantity);

      const compUnitId = comp.unit_id ?? (prod?.base_unit_id ? Number(prod.base_unit_id) : null);
      const compUnit = compUnitId ? runtimeData.unitsMap.get(compUnitId) ?? null : null;

      calculatedComponents.push({
        id: comp.id,
        code: comp.code,
        description: comp.description || prodName,
        product_id: comp.product_id,
        product_code: prodCode,
        product_name: prodName,
        component_type: comp.component_type,
        unit_id: compUnitId,
        unit_code: compUnit?.code ?? null,
        unit_symbol: compUnit?.symbol ?? compUnit?.code ?? null,
        quantity,
        quantity_expression: comp.quantity_expression,
        dimensions,
        dimension_expressions: comp.dimension_expressions,
        dimension_list: dimensionList,
        characteristic_id: resolvedChar?.id ?? comp.characteristic_id ?? null,
        characteristic_code: resolvedChar?.code ?? null,
        characteristic_name: resolvedChar?.description ?? null,
        characteristic_expression: comp.characteristic_expression,
        color_id: resolvedColorId,
        color_code: resolvedColorCode,
        color_name: resolvedColorName,
        color_hex: resolvedColorHex,
        color_source: resolvedColorSource,
        available_colors: availableColors,
        pricing_source: pricingSource,
        scale_step_used: scaleStepUsed,
        base_price: basePrice,
        price_increment: Number(comp.price_increment || 0),
        price_increment_type: comp.price_increment_type,
        increment_amount: incrementAmount,
        unit_price: unitPrice,
        total_price: totalPrice,
        ok,
        formula_error: formulaError,
      });
    } catch (err: any) {
      calculatedComponents.push({
        id: comp.id,
        code: comp.code,
        description: comp.description || prodName,
        product_id: comp.product_id,
        product_code: prodCode,
        product_name: prodName,
        component_type: comp.component_type,
        unit_id: comp.unit_id ?? (comp.product as any)?.unit_id ?? null,
        unit_code: comp.unit?.code ?? (comp.product as any)?.unit?.code ?? null,
        unit_symbol: comp.unit?.symbol ?? (comp.product as any)?.unit?.symbol ?? null,
        quantity: 0,
        quantity_expression: comp.quantity_expression,
        dimensions: {},
        dimension_expressions: comp.dimension_expressions,
        dimension_list: [],
        characteristic_id: null,
        characteristic_code: null,
        characteristic_name: null,
        characteristic_expression: comp.characteristic_expression,
        color_id: null,
        color_code: null,
        color_name: null,
        color_hex: null,
        color_source: null,
        available_colors: [],
        pricing_source: 'manual',
        scale_step_used: null,
        base_price: 0,
        price_increment: 0,
        price_increment_type: 'FIXED',
        increment_amount: 0,
        unit_price: 0,
        total_price: 0,
        ok: false,
        formula_error: err?.message || 'Error en el cálculo del componente',
      });
    }
  }

  // 5. Calculate Total Amount
  // If OTD has its own scale: Total = OTD Base Price + sum(Component Increments * quantity)
  // Otherwise: Total = sum(Component Total Prices)
  let totalAmount = 0;
  let totalIncrements = 0;

  if (scales.length > 0) {
    totalIncrements = round2(
      calculatedComponents.reduce((sum, c) => sum + (c.ok ? c.total_price : 0), 0)
    );
    totalAmount = round2(otdBasePrice + totalIncrements);
  } else {
    totalAmount = round2(
      calculatedComponents.reduce((sum, c) => sum + (c.ok ? c.total_price : 0), 0)
    );
  }

  const isValid =
    requiredMissing.length === 0 &&
    errors.length === 0 &&
    (scales.length === 0 || otdBasePrice > 0 || scales.some(s => s.price === 0)) &&
    calculatedComponents.every(c => c.ok);

  return {
    inputs: processedInputs,
    resolvedVariables,
    components: calculatedComponents,
    otdBasePrice,
    otdScaleStepUsed,
    totalIncrements,
    totalAmount,
    isValid,
    requiredMissing,
    errors,
  };
}

export function buildOtdConfigurationSnapshot(
  runtimeData: OtdRuntimeData,
  calcResult: OtdCalculationResult,
  customNotes?: string
): OtdConfigurationSnapshot {
  const { otd, selections, variables } = runtimeData;
  const workUnit = runtimeData.workUnit ?? (otd.work_unit_id ? runtimeData.unitsMap.get(otd.work_unit_id) ?? null : null);

  const inputsDisplay = selections.map(sel => {
    const val = calcResult.inputs[sel.code];
    let display = val === null || val === undefined ? '—' : String(val);
    const selUnit =
      sel.unit ??
      (sel.unit_id ? runtimeData.unitsMap.get(sel.unit_id) ?? null : null) ??
      (sel.is_dimension ? workUnit : null);

    if (sel.selection_type === 'OPTION') {
      const opt = sel.options.find(o => (o.value ?? o.code) === String(val));
      if (opt) display = opt.label || opt.code;
    } else if (sel.selection_type === 'BOOLEAN') {
      display = val ? 'Sí' : 'No';
    } else if (sel.selection_type === 'NUMBER' && typeof val === 'number') {
      display = `${val.toLocaleString('es-ES')}`;
      if (selUnit) {
        display += ` ${selUnit.symbol || selUnit.code}`;
      }
    }

    return {
      code: sel.code,
      name: sel.name || sel.code,
      value: val ?? null,
      display_value: display,
      is_dimension: sel.is_dimension,
      unit_id: selUnit?.id ?? null,
      unit_code: selUnit?.code ?? undefined,
      unit_symbol: selUnit?.symbol ?? undefined,
    };
  });

  const variablesDisplay = variables.map(v => ({
    code: v.code,
    name: v.name || v.code,
    value: calcResult.resolvedVariables[v.code] ?? 0,
    expression: v.expression,
  }));

  const snapshotComponents: OtdSnapshotComponent[] = calcResult.components.map(c => ({
    id: c.id,
    product_id: c.product_id,
    product_code: c.product_code,
    product_name: c.product_name,
    component_type: c.component_type,
    unit_id: c.unit_id,
    unit_code: c.unit_code,
    unit_symbol: c.unit_symbol,
    quantity: c.quantity,
    quantity_expression: c.quantity_expression,
    dimensions: c.dimensions,
    dimension_expressions: c.dimension_expressions,
    dimension_list: c.dimension_list,
    characteristic_id: c.characteristic_id,
    characteristic_code: c.characteristic_code,
    characteristic_name: c.characteristic_name,
    characteristic_expression: c.characteristic_expression,
    color_id: c.color_id,
    color_code: c.color_code,
    color_name: c.color_name,
    color_hex: c.color_hex,
    pricing_source: c.pricing_source,
    scale_step_used: c.scale_step_used,
    base_price: c.base_price,
    price_increment: c.price_increment,
    price_increment_type: c.price_increment_type,
    increment_amount: c.increment_amount,
    unit_price: c.unit_price,
    total_price: c.total_price,
    is_missing_price: !c.ok,
    missing_reason: c.formula_error,
  }));

  const dimensions = inputsDisplay
    .filter(i => i.is_dimension || (typeof i.value === 'number' && !isNaN(i.value)))
    .map(i => ({
      code: i.code,
      name: i.name,
      value: typeof i.value === 'number' ? i.value : (parseFloat(String(i.value)) || null),
      unit_id: i.unit_id ?? workUnit?.id ?? null,
      unit_code: i.unit_code || workUnit?.code || undefined,
      unit_name: workUnit?.name || i.unit_code || undefined,
      unit_symbol: i.unit_symbol || workUnit?.symbol || workUnit?.code || undefined,
    }));

  return {
    snapshot_version: '1.0',
    created_at: new Date().toISOString(),
    otd_id: otd.id,
    otd_code: otd.code,
    otd_name: otd.name,
    template_type: otd.template_type,
    work_unit_id: workUnit?.id ?? null,
    work_unit_code: workUnit?.code ?? null,
    work_unit_name: workUnit?.name ?? null,
    work_unit_symbol: workUnit?.symbol ?? workUnit?.code ?? null,
    work_unit: workUnit ? {
      id: workUnit.id,
      code: workUnit.code,
      name: workUnit.name,
      symbol: workUnit.symbol ?? null,
    } : null,
    inputs: calcResult.inputs,
    inputs_display: inputsDisplay,
    dimensions,
    variables: calcResult.resolvedVariables,
    variables_display: variablesDisplay,
    otd_base_price: calcResult.otdBasePrice,
    otd_scale_step_used: calcResult.otdScaleStepUsed,
    total_increments: calcResult.totalIncrements,
    components: snapshotComponents,
    total_amount: calcResult.totalAmount,
    notes: customNotes,
  };
}

export interface OninProduct {
  id: number;
  code: string;
  commercial_description: string | null;
  technical_description: string | null;
  family_id?: number | null;
  measurement_type_id?: number | null;
  unit_id?: number | null;
  unit?: { id: number; code: string; name: string; symbol?: string | null } | null;
  characteristics: OtdCharacteristicOption[];
  measurement_type?: {
    id: number;
    name: string;
    dimension_count: number;
    dimensions: Array<{
      id?: number;
      code: string;
      name: string;
      dimension_number?: number;
      unit_id?: number | null;
      unit?: { id?: number; code: string; name: string; symbol?: string | null };
    }>;
  } | null;
}

export async function fetchOninProducts(productIds: number[]): Promise<Record<number, OninProduct>> {
  if (!productIds || productIds.length === 0) return {};
  const c = client();
  const uniqueIds = Array.from(new Set(productIds.filter(id => Number.isFinite(id) && id > 0)));
  if (uniqueIds.length === 0) return {};

  const { data: prods, error } = await c
    .from('product')
    .select('id, code, commercial_description, technical_description, family_id, measurement_type_id')
    .in('id', uniqueIds);

  if (error || !prods) return {};

  // Fetch families if any product needs measurement_type_id from family
  const familyIds = Array.from(new Set(prods.map((p: any) => p.family_id).filter((f: any) => f != null)));
  const familyMap: Record<number, { measurement_type_id: number | null }> = {};
  if (familyIds.length > 0) {
    const { data: fams } = await c
      .from('product_family')
      .select('id, measurement_type_id')
      .in('id', familyIds);
    if (fams) {
      for (const f of fams) {
        familyMap[Number(f.id)] = {
          measurement_type_id: f.measurement_type_id ? Number(f.measurement_type_id) : null,
        };
      }
    }
  }

  // Determine all measurement type IDs
  const mtIds = Array.from(
    new Set(
      prods
        .map((p: any) =>
          Number.isFinite(p.measurement_type_id)
            ? Number(p.measurement_type_id)
            : p.family_id && familyMap[Number(p.family_id)]
            ? familyMap[Number(p.family_id)].measurement_type_id
            : null
        )
        .filter((id: any): id is number => id != null)
    )
  );

  const mtMap: Record<number, { id: number; name: string; dimension_count: number; dimensions: any[] }> = {};
  if (mtIds.length > 0) {
    const [mtRes, mtdRes, unitRes] = await Promise.all([
      c.from('measurement_type').select('id, name, dimension_count').in('id', mtIds),
      c
        .from('measurement_type_dimension')
        .select('id, measurement_type_id, dimension_number, code, name, unit_id, decimals')
        .in('measurement_type_id', mtIds)
        .order('dimension_number'),
      c.from('unit').select('id, code, name'),
    ]);

    const units = (unitRes.data ?? []) as Array<{ id: number; code: string; name: string }>;
    const unitMap = new Map(units.map(u => [Number(u.id), u]));

    const dimsByMt = new Map<number, any[]>();
    for (const d of mtdRes.data ?? []) {
      const mid = Number(d.measurement_type_id);
      const list = dimsByMt.get(mid) ?? [];
      const u = d.unit_id ? unitMap.get(Number(d.unit_id)) : undefined;
      list.push({
        id: Number(d.id),
        code: String(d.code),
        name: String(d.name),
        dimension_number: Number(d.dimension_number),
        unit_id: d.unit_id == null ? null : Number(d.unit_id),
        unit: u ? { code: u.code, name: u.name } : undefined,
      });
      dimsByMt.set(mid, list);
    }

    for (const mt of mtRes.data ?? []) {
      const mid = Number(mt.id);
      mtMap[mid] = {
        id: mid,
        name: String(mt.name),
        dimension_count: Number(mt.dimension_count ?? 0),
        dimensions: dimsByMt.get(mid) ?? [],
      };
    }
  }

  // Fetch effective characteristics (product_attribute, family + article level, with colors)
  const { byProduct: charsByProduct } = await loadEffectiveCharacteristicsForProducts(
    c,
    prods.map((p: any) => ({ id: Number(p.id), family_id: p.family_id != null ? Number(p.family_id) : null })),
  );

  const result: Record<number, OninProduct> = {};
  for (const p of prods) {
    const pid = Number(p.id);
    const mtId = Number.isFinite(p.measurement_type_id)
      ? Number(p.measurement_type_id)
      : p.family_id && familyMap[Number(p.family_id)]
      ? familyMap[Number(p.family_id)].measurement_type_id
      : null;

    result[pid] = {
      id: pid,
      code: String(p.code),
      commercial_description: p.commercial_description || null,
      technical_description: p.technical_description || null,
      family_id: p.family_id ? Number(p.family_id) : null,
      measurement_type_id: mtId,
      characteristics: charsByProduct.get(pid) ?? [],
      measurement_type: mtId && mtMap[mtId] ? mtMap[mtId] : null,
    };
  }

  return result;
}

export async function searchOninProducts(query: string = '', limit: number = 25): Promise<OninProduct[]> {
  const c = client();
  let queryBuilder = c
    .from('product')
    .select('id')
    .eq('active', true)
    .is('deleted_at', null)
    .limit(limit);

  const term = sanitizeSearchTerm(query);
  if (term.length > 0) {
    const clean = `%${term}%`;
    queryBuilder = queryBuilder.or(
      `code.ilike.${clean},commercial_description.ilike.${clean},technical_description.ilike.${clean}`
    );
  }

  const { data: prods, error } = await queryBuilder;

  if (error || !prods || prods.length === 0) return [];
  const ids = prods.map((p: any) => Number(p.id));
  const fullMap = await fetchOninProducts(ids);
  return ids.map(id => fullMap[id]).filter(Boolean);
}

export type OtdSummary = {
  id: number;
  code: string;
  name: string;
  template_type: string | null;
  active: boolean;
};

/**
 * Colores disponibles para la "entrada de oficina" de color del OTD: la unión,
 * sin duplicados, de los colores de todas las características que puede llegar
 * a resolver algún componente de este OTD. Elegir uno aquí es solo un atajo:
 * se propone como valor por defecto en cada componente cuya característica
 * resuelta admita ese mismo color, pero el usuario sigue pudiendo cambiarlo
 * componente a componente.
 */
export function getOtdColorOptions(runtimeData: OtdRuntimeData): OtdColorOption[] {
  const byId = new Map<number, OtdColorOption>();
  for (const list of runtimeData.colorsByCharacteristic.values()) {
    for (const color of list) {
      if (!byId.has(color.id)) byId.set(color.id, color);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function listActiveOtds(): Promise<OtdSummary[]> {
  const c = client();
  const { data, error } = await c
    .from('otd')
    .select('id, code, name, template_type, active')
    .eq('active', true)
    .order('name');

  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as OtdSummary[];
}

