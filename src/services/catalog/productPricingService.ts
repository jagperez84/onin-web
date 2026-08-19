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
 * Original uses ESCALADO for generic scales and ESCALADO_CARACTERISTICA for
 * characteristic-specific scales. A scale row is selected when both stored
 * dimensions are greater than or equal to the requested dimensions, ordered
 * by dimension_1 and then dimension_2 ascending.
 *
 * If scaling is enabled but no matching row exists, Original returns 0; it
 * does not silently fall back to the article/base-characteristic price.
 * Quantity, discounts, VAT, formulas and despiece prices are deliberately
 * outside this resolver and will be applied by their respective stages.
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
      .filter(row => row.dimension_2 != null && Number(row.dimension_2) >= dim2)
      .sort((a, b) => Number(a.dimension_1) - Number(b.dimension_1) || Number(a.dimension_2) - Number(b.dimension_2));

    const scale = candidates[0];
    if (scale) {
      return {
        price: round2(Number(scale.price)),
        source: product.scaled_by_characteristic ? 'scale_characteristic' : 'scale',
        scale,
      };
    }

    return {
      price: 0,
      source: product.scaled_by_characteristic ? 'scale_characteristic' : 'scale',
    };
  }

  if (characteristic?.pvp != null) {
    return { price: round2(Number(characteristic.pvp)), source: 'characteristic' };
  }

  return { price: round2(Number(product.sales_price ?? 0)), source: 'base' };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
