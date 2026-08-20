import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import type { Product, ProductCharacteristic, ProductFamilyRef, ProductLineBehavior } from './productRepository';
import type { ProductScaleRow } from './productCommercialRepository';
import type { MeasurementDimension, MeasurementType } from './measurementTypeRepository';

export type MasterProductConfiguration = {
  product: Product;
  family: ProductFamilyRef | null;
  lineBehavior: ProductLineBehavior | null;
  baseUnit: { id: number; code: string; name: string } | null;
  measurementType: (MeasurementType & { dimensions: MeasurementDimension[] }) | null;
  dimensions: MeasurementDimension[];
  attributes: Array<{
    assignment_id: number;
    attribute_id: number;
    code: string;
    name: string;
    data_type: string;
    required: boolean;
    sort_order: number;
    values: Array<{ id: number; code: string; name: string; sort_order: number }>;
  }>;
  characteristics: ProductCharacteristic[];
  scales: ProductScaleRow[];
  bomComponents: Array<{
    id: number;
    code: string;
    description: string | null;
    quantity_expression: string | null;
    unit_id: number | null;
    unit_code?: string | null;
    unit_name?: string | null;
    product_id: number | null;
    product_code?: string | null;
    product_name?: string | null;
    unit_price?: number;
    unit_cost?: number;
    sort_order: number;
    active: boolean;
  }>;
  unitsMap: Map<number, { id: number; code: string; name: string }>;
  loadedAt: string;
  versionHash: string;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

function generateVersionHash(data: { product: Product; scales: ProductScaleRow[]; characteristics: ProductCharacteristic[]; attributes: any[]; bomComponents: any[]; measurementType: any }): string {
  const parts = [
    data.product.id,
    data.product.sales_price,
    data.product.purchase_price,
    data.product.price_increment,
    data.product.measurement_type_id,
    data.product.scaled ? '1' : '0',
    data.product.scaled_by_characteristic ? '1' : '0',
    data.scales.map(s => `${s.dimension_1}-${s.dimension_2}-${s.price}-${s.characteristic_id}`).join('|'),
    data.characteristics.map(c => `${c.id}-${c.code}-${c.pvp}-${c.price_increment}-${c.active}`).join('|'),
    data.attributes.map(a => `${a.attribute_id}-${a.required}-${a.values.map((v: any) => v.id).join(',')}`).join('|'),
    data.bomComponents.map(b => `${b.id}-${b.code}-${b.quantity_expression}`).join('|'),
    data.measurementType?.dimensions?.map((d: any) => `${d.dimension_number}-${d.code}-${d.unit_id}-${d.decimals}`).join('|') ?? '',
  ];
  return parts.join('::');
}

export async function loadMasterProductConfiguration(productId: number, companyId?: number | null): Promise<MasterProductConfiguration> {
  const c = client();
  const productRes = await c.from('product').select('*').eq('id', productId).single();
  if (productRes.error) throw new CoreRepositoryError(productRes.error.message || 'Artículo no encontrado');
  const product = productRes.data as Product;
  const actualCompanyId = product.company_id ?? companyId ?? 1;

  const fetchFamiliesSafe = async () => {
    const res = await c.from('product_family').select('id,code,name,product_type_id,measurement_type_id,minimum_remainder,confectionable,recuttable,line_behavior_id').eq('company_id', actualCompanyId).eq('active', true).is('deleted_at', null);
    if (!res.error) return res;
    if (res.error.message?.includes('measurement_type_id')) {
      return await c.from('product_family').select('id,code,name,product_type_id,minimum_remainder,confectionable,recuttable,line_behavior_id').eq('company_id', actualCompanyId).eq('active', true).is('deleted_at', null);
    }
    return res;
  };

  const [unitsRes, familiesRes, lineBehaviorsRes, characteristicsRes, scalesRes, assignmentsRes, otdRes] = await Promise.all([
    c.from('unit').select('id,code,name').eq('company_id', actualCompanyId).eq('active', true).is('deleted_at', null),
    fetchFamiliesSafe(),
    c.from('product_line_behavior').select('*').eq('company_id', actualCompanyId).eq('active', true).is('deleted_at', null),
    c.from('product_characteristic').select('*').eq('product_id', productId).eq('active', true).is('deleted_at', null).order('code'),
    c.from('product_scale').select('*').eq('product_id', productId).is('deleted_at', null).order('dimension_1').order('dimension_2'),
    c.from('product_attribute_assignment').select('id,attribute_id,required,sort_order,attribute:product_attribute(id,code,name,data_type)').eq('product_id', productId).eq('active', true).is('deleted_at', null).order('sort_order'),
    c.from('otd_component').select('*').eq('product_id', productId).eq('active', true).is('deleted_at', null).order('sort_order'),
  ]);

  const unitsList = (unitsRes.data ?? []) as Array<{ id: number; code: string; name: string }>;
  const unitsMap = new Map(unitsList.map(u => [u.id, u]));
  const baseUnit = product.base_unit_id ? unitsMap.get(product.base_unit_id) ?? null : null;
  const lineBehaviors = (lineBehaviorsRes.data ?? []) as ProductLineBehavior[];
  const lineBehaviorsMap = new Map(lineBehaviors.map(b => [b.id, b]));
  const families = (familiesRes.data ?? []).map((f: any) => ({ ...f, lineBehavior: f.line_behavior_id ? lineBehaviorsMap.get(f.line_behavior_id) ?? null : null })) as ProductFamilyRef[];
  const family = product.family_id ? families.find(f => f.id === product.family_id) ?? null : null;
  const lineBehavior = family?.lineBehavior ?? null;

  // Measurement type is inherited from the family unless explicitly overridden on the product.
  let measurementType: (MeasurementType & { dimensions: MeasurementDimension[] }) | null = null;
  let dimensions: MeasurementDimension[] = [];
  const effectiveMeasurementTypeId = product.measurement_type_id ?? family?.measurement_type_id ?? null;

  if (effectiveMeasurementTypeId != null) {
    const [mTypeRes, mDimsRes] = await Promise.all([
      c.from('measurement_type').select('*').eq('id', effectiveMeasurementTypeId).maybeSingle(),
      c.from('measurement_type_dimension').select('*').eq('measurement_type_id', effectiveMeasurementTypeId).order('dimension_number'),
    ]);

    if (mTypeRes.data) {
      const dims = (mDimsRes.data ?? []).map((d: any) => ({
        id: Number(d.id),
        measurement_type_id: Number(d.measurement_type_id),
        dimension_number: Number(d.dimension_number),
        code: String(d.code || ''),
        name: String(d.name || ''),
        unit_id: d.unit_id == null ? null : Number(d.unit_id),
        decimals: Number(d.decimals ?? 0),
      }));

      const dimensionCount = Number(mTypeRes.data.dimension_count ?? dims.length);
      if (dims.length < dimensionCount) {
        const existingNumbers = new Set(dims.map(d => d.dimension_number));
        const fallbackUnitId = mTypeRes.data.result_unit_id == null ? null : Number(mTypeRes.data.result_unit_id);
        const fallbackDecimals = Number(mTypeRes.data.result_decimals ?? 0);
        for (let number = 1; number <= dimensionCount; number += 1) {
          if (!existingNumbers.has(number)) {
            dims.push({
              id: undefined,
              measurement_type_id: Number(effectiveMeasurementTypeId),
              dimension_number: number,
              code: `DIMENSION_${number}`,
              name: `Dimensión ${number}`,
              unit_id: fallbackUnitId,
              decimals: fallbackDecimals,
            });
          }
        }
        dims.sort((a, b) => a.dimension_number - b.dimension_number);
      }

      dimensions = dims;
      measurementType = { ...mTypeRes.data, dimensions: dims };
    }
  }

  let assignments = (assignmentsRes.data ?? []) as any[];
  if (assignments.length === 0 && product.family_id) {
    const familyAttrsRes = await c.from('product_family_attribute').select('id,attribute_id,required,sort_order,attribute:product_attribute(id,code,name,data_type)').eq('family_id', product.family_id).eq('active', true).is('deleted_at', null).order('sort_order');
    if (familyAttrsRes.data && familyAttrsRes.data.length > 0) assignments = familyAttrsRes.data;
  }
  const attributeIds = assignments.map(a => Number(a.attribute_id)).filter(Boolean);
  const valuesMap = new Map<number, Array<{ id: number; code: string; name: string; sort_order: number }>>();

  if (attributeIds.length > 0) {
    const { data: valuesData } = await c.from('product_attribute_value').select('id,attribute_id,code,name,sort_order').in('attribute_id', attributeIds).eq('active', true).is('deleted_at', null).order('sort_order');
    for (const val of valuesData ?? []) {
      const attrId = Number(val.attribute_id);
      const list = valuesMap.get(attrId) ?? [];
      list.push({ id: Number(val.id), code: String(val.code || ''), name: String(val.name || ''), sort_order: Number(val.sort_order ?? 0) });
      valuesMap.set(attrId, list);
    }
  }

  const attributes = assignments.map((a: any) => {
    const attr = a.attribute || a.product_attribute;
    return { assignment_id: Number(a.id), attribute_id: Number(a.attribute_id), code: attr?.code ?? '', name: attr?.name ?? '', data_type: attr?.data_type ?? 'TEXT', required: Boolean(a.required), sort_order: Number(a.sort_order ?? 0), values: valuesMap.get(Number(a.attribute_id)) ?? [] };
  });

  const characteristics = (characteristicsRes.data ?? []) as ProductCharacteristic[];
  const scales = (scalesRes.data ?? []) as ProductScaleRow[];

  const rawBom = (otdRes.data ?? []) as any[];
  const componentProductIds = rawBom.map(b => b.product_id).filter((id): id is number => id != null);
  const componentProductsMap = new Map<number, Product>();
  if (componentProductIds.length > 0) {
    const { data: cpData } = await c.from('product').select('id,code,commercial_description,technical_description,sales_price,purchase_price,base_unit_id').in('id', [...new Set(componentProductIds)]);
    for (const cp of cpData ?? []) componentProductsMap.set(Number(cp.id), cp as Product);
  }

  const bomComponents = rawBom.map(b => {
    const compProd = b.product_id ? componentProductsMap.get(Number(b.product_id)) : null;
    const unit = b.unit_id ? unitsMap.get(Number(b.unit_id)) : compProd?.base_unit_id ? unitsMap.get(Number(compProd.base_unit_id)) : null;
    return { id: Number(b.id), code: String(b.code || ''), description: b.description || compProd?.commercial_description || compProd?.technical_description || null, quantity_expression: b.quantity_expression || null, unit_id: unit?.id ?? null, unit_code: unit?.code ?? null, unit_name: unit?.name ?? null, product_id: b.product_id ? Number(b.product_id) : null, product_code: compProd?.code ?? null, product_name: compProd?.commercial_description || compProd?.technical_description || null, unit_price: Number(compProd?.sales_price ?? 0), unit_cost: Number(compProd?.purchase_price ?? 0), sort_order: Number(b.sort_order ?? 0), active: Boolean(b.active) };
  });

  const versionHash = generateVersionHash({ product, scales, characteristics, attributes, bomComponents, measurementType });
  return { product, family, lineBehavior, baseUnit, measurementType, dimensions, attributes, characteristics, scales, bomComponents, unitsMap, loadedAt: new Date().toISOString(), versionHash };
}
