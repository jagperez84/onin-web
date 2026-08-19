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
  const { data: product, error: productError } = await c.from('product').select('id,measurement_type_id').eq('id', productId).single();
  if (productError) throw new CoreRepositoryError(productError.message);

  let dimensions: ProductDimensionDefinition[] = [];
  if (product.measurement_type_id != null) {
    const { data, error } = await c.from('measurement_type_dimension')
      .select('dimension_number,code,name,unit_id,decimals')
      .eq('measurement_type_id', product.measurement_type_id)
      .order('dimension_number');
    if (error) throw new CoreRepositoryError(error.message);
    dimensions = (data ?? []).map((d: any) => ({
      dimension_number: Number(d.dimension_number),
      code: d.code,
      name: d.name,
      unit_id: d.unit_id == null ? null : Number(d.unit_id),
      decimals: Number(d.decimals ?? 0),
    }));
  }

  const { data: assignments, error: assignmentError } = await c.from('product_attribute_assignment')
    .select('id,attribute_id,required,sort_order,attribute:product_attribute(id,code,name,data_type)')
    .eq('product_id', productId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('sort_order')
    .order('id');
  if (assignmentError) throw new CoreRepositoryError(assignmentError.message);

  const attributeIds = (assignments ?? []).map((a: any) => Number(a.attribute_id));
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

  const characteristics: ProductCharacteristicDefinition[] = (assignments ?? []).map((a: any) => ({
    assignment_id: Number(a.id),
    attribute_id: Number(a.attribute_id),
    attribute_code: a.attribute?.code ?? '',
    attribute_name: a.attribute?.name ?? '',
    data_type: a.attribute?.data_type ?? 'TEXT',
    required: !!a.required,
    sort_order: Number(a.sort_order ?? 0),
    values: values.filter(v => Number(v.attribute_id) === Number(a.attribute_id)).map(v => ({
      id: Number(v.id), code: v.code, name: v.name, sort_order: Number(v.sort_order ?? 0),
    })),
  }));

  return { product_id: Number(product.id), measurement_type_id: product.measurement_type_id == null ? null : Number(product.measurement_type_id), dimensions, characteristics };
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
