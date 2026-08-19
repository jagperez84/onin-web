import type { Product, ProductCharacteristic } from './productRepository';
import type { ProductScaleRow } from './productCommercialRepository';

export type ProductPriceInput = {
  product: Product;
  characteristic?: ProductCharacteristic | null;
  dimension1?: number | null;
  dimension2?: number | null;
  scales?: ProductScaleRow[];
};

export type ProductPriceResult = {
  price: number;
  source: 'base' | 'characteristic' | 'scale' | 'scale_characteristic';
  scale?: ProductScaleRow;
};

/**
 * Resolves the unit sales price following the behaviour found in Onin Original.
 *
 * Original uses the article's ESCALADO flag for generic scales and
 * ESCALADO_CARACTERISTICA for characteristic-specific scales. A scale row is
 * selected when both dimensions are greater than or equal to the requested
 * dimensions, ordered by the smallest dimension pair first.
 *
 * This service deliberately does not apply quantity, discount, VAT, formula
 * results or component/despiece prices. Those belong to the quotation/factory
 * calculation stages.
 */
export function resolveProductUnitPrice(input: ProductPriceInput): ProductPriceResult {
  const { product, characteristic, scales = [] } = input;
  const dim1 = Math.trunc(input.dimension1 ?? 0);
  const dim2 = Math.trunc(input.dimension2 ?? 0);

  if (product.scaled || product.scaled_by_characteristic) {
    const characteristicId = product.scaled_by_characteristic ? characteristic?.id ?? null : null;
    const candidates = scales
      .filter(row => row.characteristic_id === characteristicId)
      .filter(row => Number(row.dimension_1) >= dim1)
      .filter(row => row.dimension_2 == null || Number(row.dimension_2) >= dim2)
      .sort((a, b) => Number(a.dimension_1) - Number(b.dimension_1) || (Number(a.dimension_2 ?? 0) - Number(b.dimension_2 ?? 0)));

    const scale = candidates[0];
    if (scale) {
      return {
        price: round2(Number(scale.price)),
        source: product.scaled_by_characteristic ? 'scale_characteristic' : 'scale',
        scale,
      };
    }
  }

  if (characteristic?.pvp != null) {
    return { price: round2(Number(characteristic.pvp)), source: 'characteristic' };
  }

  return { price: round2(Number(product.sales_price ?? 0)), source: 'base' };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
