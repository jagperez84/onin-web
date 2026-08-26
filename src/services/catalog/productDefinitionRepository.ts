import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

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

  let dimensions: ProductDimensionDefinition[] = [];
  if (effectiveMeasurementTypeId != null) {
    const [measurementTypeRes, dimensionsRes] = await Promise.all([
      c.from('measurement_type').select('dimension_count,result_unit_id,result_decimals').eq('id', effectiveMeasurementTypeId).maybeSingle(),
      c.from('measurement_type_dimension')
        .select('dimension_number,code,name,unit_id,decimals')
        .eq('measurement_type_id', effectiveMeasurementTypeId)
        .order('dimension_number'),
    ]);
    if (measurementTypeRes.error) throw new CoreRepositoryError(measurementTypeRes.error.message);
    if (dimensionsRes.error) throw new CoreRepositoryError(dimensionsRes.error.message);

    dimensions = (dimensionsRes.data ?? []).map((d: any) => ({
      dimension_number: Number(d.dimension_number),
      code: String(d.code || ''),
      name: String(d.name || ''),
      unit_id: d.unit_id == null ? null : Number(d.unit_id),
      decimals: Number(d.decimals ?? 0),
    }));

    // The measurement type's dimension_count is authoritative. Some existing
    // measurement types only store the count and do not have rows in
    // measurement_type_dimension. Keep the quotation line configurable in that
    // case instead of silently losing the dimension.
    const dimensionCount = Number(measurementTypeRes.data?.dimension_count ?? dimensions.length);
    if (dimensions.length < dimensionCount) {
      const existingNumbers = new Set(dimensions.map(d => d.dimension_number));
      const fallbackUnitId = measurementTypeRes.data?.result_unit_id == null ? null : Number(measurementTypeRes.data.result_unit_id);
      const fallbackDecimals = Number(measurementTypeRes.data?.result_decimals ?? 0);
      for (let number = 1; number <= dimensionCount; number += 1) {
        if (!existingNumbers.has(number)) {
          dimensions.push({
            dimension_number: number,
            code: `DIMENSION_${number}`,
            name: `Dimensión ${number}`,
            unit_id: fallbackUnitId,
            decimals: fallbackDecimals,
          });
        }
      }
      dimensions.sort((a, b) => a.dimension_number - b.dimension_number);
    }
  }

  // Effective characteristics:
  //   Family characteristics
  //   + article-specific additions/overrides
  //   - article-specific exclusions
  const [familyAssignmentsRes, productAssignmentsRes, exclusionsRes] = await Promise.all([
    product.family_id == null
      ? Promise.resolve({ data: [], error: null } as any)
      : c.from('product_family_attribute')
          .select('id,attribute_id,required,sort_order,attribute:product_attribute(id,code,name,data_type)')
          .eq('family_id', product.family_id)
          .eq('active', true)
          .is('deleted_at', null)
          .order('sort_order')
          .order('id'),
    c.from('product_attribute_assignment')
      .select('id,attribute_id,required,sort_order,attribute:product_attribute(id,code,name,data_type)')
      .eq('product_id', productId)
      .eq('active', true)
      .is('deleted_at', null)
      .order('sort_order')
      .order('id'),
    c.from('product_family_attribute_exclusion')
      .select('attribute_id')
      .eq('product_id', productId),
  ]);

  if (familyAssignmentsRes.error) throw new CoreRepositoryError(familyAssignmentsRes.error.message);
  if (productAssignmentsRes.error) throw new CoreRepositoryError(productAssignmentsRes.error.message);
  if (exclusionsRes.error) throw new CoreRepositoryError(exclusionsRes.error.message);

  const excludedIds = new Set((exclusionsRes.data ?? []).map((x: any) => Number(x.attribute_id)));
  const effectiveAssignments = new Map<number, any>();

  for (const assignment of familyAssignmentsRes.data ?? []) {
    const attributeId = Number(assignment.attribute_id);
    if (!excludedIds.has(attributeId)) effectiveAssignments.set(attributeId, assignment);
  }

  for (const assignment of productAssignmentsRes.data ?? []) {
    effectiveAssignments.set(Number(assignment.attribute_id), assignment);
  }

  const assignments = Array.from(effectiveAssignments.values()).sort((a, b) => {
    const order = Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    return order !== 0 ? order : Number(a.id) - Number(b.id);
  });

  const attributeIds = assignments.map((a: any) => Number(a.attribute_id)).filter(Boolean);
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

  const characteristics: ProductCharacteristicDefinition[] = assignments.map((a: any) => ({
    assignment_id: Number(a.id),
    attribute_id: Number(a.attribute_id),
    attribute_code: a.attribute?.code ?? '',
    attribute_name: a.attribute?.name ?? '',
    data_type: a.attribute?.data_type ?? 'TEXT',
    required: !!a.required,
    sort_order: Number(a.sort_order ?? 0),
    values: values.filter(v => Number(v.attribute_id) === Number(a.attribute_id)).map(v => ({
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
