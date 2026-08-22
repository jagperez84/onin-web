import type { Product } from '../catalog/productRepository';

/**
 * OTD components always resolve their article from component.product_id.
 * Office OPTION values are configuration values only and never select articles.
 * The function signature is kept stable for the current calculation service.
 */
export function resolveComponentProduct(
  component: { product_id: number | null },
  _selections: unknown,
  _rawValues: unknown,
  products: Map<number, Product>
): { product_id: number | null; product: Product | null; source: 'FIXED' | 'MISSING' } {
  if (component.product_id) {
    const product = products.get(Number(component.product_id)) ?? null;
    return { product_id: Number(component.product_id), product, source: product ? 'FIXED' : 'MISSING' };
  }
  return { product_id: null, product: null, source: 'MISSING' };
}
