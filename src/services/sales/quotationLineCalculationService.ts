import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { calculateBreakdown, type BreakdownComponent } from '../catalog/breakdownCalculationService';
import { resolveProductUnitPrice } from '../catalog/productPricingService';
import type { Product, ProductCharacteristic } from '../catalog/productRepository';
import type { ProductScaleRow } from '../catalog/productCommercialRepository';
import type { QuotationLineDimensionDraft } from './quotationCreationRepository';

export type QuotationLineCalculation = {
  unit_price: number;
  breakdown_price: number;
  breakdown_cost: number;
  components: ReturnType<typeof calculateBreakdown>['components'];
  variables: Record<string, number>;
};

/** Read-only bridge between an article in a quotation and its OTD definition. */
export async function calculateQuotationLine(input: {
  product: Product;
  dimensions?: QuotationLineDimensionDraft[];
  characteristic?: ProductCharacteristic | null;
  scales?: ProductScaleRow[];
}): Promise<QuotationLineCalculation> {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');

  const variables: Record<string, number> = {};
  for (const dimension of input.dimensions ?? []) {
    if (dimension.code && dimension.value != null && Number.isFinite(Number(dimension.value))) {
      variables[dimension.code] = Number(dimension.value);
    }
  }

  const { data: rows, error } = await supabase
    .from('otd_component')
    .select('id,product_id,code,description,quantity_expression,unit_id,active,sort_order')
    .eq('product_id', input.product.id)
    .eq('active', true)
    .order('sort_order');
  if (error) throw new CoreRepositoryError(error.message);

  const productIds = [...new Set(((rows ?? []) as any[])
    .map(row => row.product_id == null ? null : Number(row.product_id))
    .filter((id): id is number => id != null))];

  const products = new Map<number, Product>();
  if (productIds.length) {
    const { data, error: productError } = await supabase
      .from('product')
      .select('*')
      .in('id', productIds)
      .is('deleted_at', null);
    if (productError) throw new CoreRepositoryError(productError.message);
    for (const product of (data ?? []) as Product[]) products.set(Number(product.id), product);
  }

  const dimensionValues = Object.values(variables);
  const components: BreakdownComponent[] = ((rows ?? []) as any[]).map((row) => {
    const componentProduct = row.product_id == null ? null : products.get(Number(row.product_id)) ?? null;
    return {
      id: Number(row.id),
      code: String(row.code ?? ''),
      description: row.description ?? null,
      quantity_expression: row.quantity_expression ?? null,
      unit_id: row.unit_id == null ? null : Number(row.unit_id),
      product: componentProduct,
      dimension1: dimensionValues[0] ?? null,
      dimension2: dimensionValues[1] ?? null,
    };
  });

  const breakdown = components.length
    ? calculateBreakdown({ variables, components })
    : { components: [], price: 0, cost: 0 };

  const pricing = resolveProductUnitPrice({
    product: input.product,
    characteristic: input.characteristic,
    dimension1: dimensionValues[0] ?? null,
    dimension2: dimensionValues[1] ?? null,
    scales: input.scales ?? [],
  });

  return {
    unit_price: breakdown.components.length ? breakdown.price : pricing.price,
    breakdown_price: breakdown.price,
    breakdown_cost: breakdown.cost,
    components: breakdown.components,
    variables,
  };
}

/** Resolve an article and recalculate its quotation price without mutating catalog data. */
export async function calculateQuotationLineByProductId(input: {
  productId: number;
  dimensions?: QuotationLineDimensionDraft[];
}): Promise<QuotationLineCalculation> {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');

  const { data: product, error } = await supabase
    .from('product')
    .select('*')
    .eq('id', input.productId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  if (!product) throw new CoreRepositoryError('No se ha encontrado el artículo seleccionado.');

  return calculateQuotationLine({
    product: product as Product,
    dimensions: input.dimensions,
  });
}
