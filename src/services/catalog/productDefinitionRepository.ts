import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { resolveEffectiveDimensions } from './measurementTypeRepository';
import { listProductCharacteristicConfiguration } from './productAttributeRepository';

export type ProductDimensionDefinition = {
  dimension_number: number;
  code: string;
  name: string;
  unit_id: number | null;
  decimals: number;
};

export type ProductCharacteristicDefinition = {
  assignment_id: number;
  attribute_id: number;
  attribute_code: string;
  attribute_name: string;
  data_type: string;
  required: boolean;
  sort_order: number;
  scaled: boolean;
  pvp: number | null;
  values: { id: number; code: string; name: string; sort_order: number }[];
};

export type ProductLineDefinition = {
  product_id: number;
  measurement_type_id: number | null;
  dimensions: ProductDimensionDefinition[];
  characteristics: ProductCharacteristicDefinition[];
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export async function getProductLineDefinition(productId: number): Promise<ProductLineDefinition> {
  const c = client();

  const { data: product, error: productError } = await c
    .from('product')
    .select('id,measurement_type_id,family_id')
    .eq('id', productId)
    .single();
  if (productError) throw new CoreRepositoryError(productError.message);

  // Dimensions are inherited from the Family through its Measurement Type.
  // A product-level measurement_type_id, when present, remains an explicit override.
  let effectiveMeasurementTypeId: number | null = product.measurement_type_id == null ? null : Number(product.measurement_type_id);
  if (effectiveMeasurementTypeId == null && product.family_id != null) {
    const { data: family, error: familyError } = await c
      .from('product_family')
      .select('measurement_type_id')
      .eq('id', product.family_id)
      .single();
    if (familyError) throw new CoreRepositoryError(familyError.message);
    effectiveMeasurementTypeId = family?.measurement_type_id == null ? null : Number(family.measurement_type_id);
  }

  const { dimensions: resolvedDimensions } = await resolveEffectiveDimensions(effectiveMeasurementTypeId);
  const dimensions: ProductDimensionDefinition[] = resolvedDimensions.map(d => ({
    dimension_number: d.dimension_number,
    code: d.code,
    name: d.name,
    unit_id: d.unit_id ?? null,
    decimals: d.decimals,
  }));

  // Características efectivas (familia heredada + propias del artículo − exclusiones):
  // misma resolución que usa la pantalla de artículo y el motor de precio del presupuesto,
  // en vez de una fusión propia que podía quedarse desactualizada frente a ellas.
  const effectiveAttrs = (await listProductCharacteristicConfiguration(productId)).filter(a => !a.excluded);

  const attributeIds = effectiveAttrs.map(a => a.attribute_id).filter(Boolean);
  let values: any[] = [];
  if (attributeIds.length) {
    const { data, error } = await c.from('product_attribute_value')
      .select('id,attribute_id,code,name,sort_order')
      .in('attribute_id', attributeIds)
      .eq('active', true)
      .is('deleted_at', null)
      .order('sort_order')
      .order('id');
    if (error) throw new CoreRepositoryError(error.message);
    values = data ?? [];
  }

  const characteristics: ProductCharacteristicDefinition[] = effectiveAttrs.map(a => ({
    assignment_id: a.assignment_id,
    attribute_id: a.attribute_id,
    attribute_code: a.code,
    attribute_name: a.name,
    data_type: a.data_type,
    required: a.required,
    sort_order: a.sort_order,
    scaled: a.scaled,
    pvp: a.pvp,
    values: values.filter(v => Number(v.attribute_id) === a.attribute_id).map(v => ({
      id: Number(v.id),
      code: v.code,
      name: v.name,
      sort_order: Number(v.sort_order ?? 0),
    })),
  }));

  return {
    product_id: Number(product.id),
    measurement_type_id: effectiveMeasurementTypeId,
    dimensions,
    characteristics,
  };
}

export function dimensionsForQuotationSnapshot(definition: ProductLineDefinition, values: Record<string, number | null>) {
  return definition.dimensions.map((dimension, index) => ({
    code: dimension.code,
    name: dimension.name,
    value: values[dimension.code] == null ? null : Number(values[dimension.code]),
    unit_id: dimension.unit_id,
    sort_order: index,
  }));
}
