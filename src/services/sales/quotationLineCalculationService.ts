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

/**
 * Resolves the commercial/technical behaviour of an article in a quotation line.
 *
 * OTD components are the editable technical definition. The calculation is
 * deliberately read-only here: quotation editing can ask for a recalculation
 * without mutating catalog or OTD data.
 */
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

  const components: BreakdownComponent[] = ((rows ?? []) as any[]).map((row) => ({
    id: Number(row.id),
    code: String(row.code ?? ''),
    description: row.description ?? null,
    quantity_expression: row.quantity_expression ?? null,
    unit_id: row.unit_id == null ? null : Number(row.unit_id),
    product: null,
  }));

  const breakdown = components.length
    ? calculateBreakdown({ variables, components })
    : { components: [], price: 0, cost: 0 };

  const dimensionValues = Object.values(variables);
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
