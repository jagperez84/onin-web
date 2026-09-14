import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { resolveEffectiveDimensions } from './measurementTypeRepository';
import { listProductCharacteristicConfiguration, listEffectiveAttributeColors } from './productAttributeRepository';

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
  required: boolean;
  sort_order: number;
  scaled: boolean;
  pvp: number | null;
  colors: { color_id: number; code: string; name: string }[];
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

  const colorsByAttribute = new Map<number, { color_id: number; code: string; name: string }[]>();
  await Promise.all(effectiveAttrs.map(async a => {
    colorsByAttribute.set(a.attribute_id, await listEffectiveAttributeColors(a.attribute_id, a.source, a.assignment_id));
  }));

  const characteristics: ProductCharacteristicDefinition[] = effectiveAttrs.map(a => ({
    assignment_id: a.assignment_id,
    attribute_id: a.attribute_id,
    attribute_code: a.code,
    attribute_name: a.name,
    required: a.required,
    sort_order: a.sort_order,
    scaled: a.scaled,
    pvp: a.pvp,
    colors: colorsByAttribute.get(a.attribute_id) ?? [],
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
