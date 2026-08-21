import type { Product, ProductCharacteristic } from '../catalog/productRepository';

export type OtdResolvedOption = {
  product_id: number | null;
  product: Product | null;
};

export function resolveOtdOptionProduct(
  options: Array<{ value: string | null; code: string; label: string; product_id?: number | null; product?: Product | null }>,
  rawValue: unknown
): OtdResolvedOption {
  const raw = rawValue == null ? '' : String(rawValue).trim();
  if (!raw) return { product_id: null, product: null };

  const option = options.find(o =>
    (o.value != null && String(o.value).trim() === raw) ||
    String(o.code).trim() === raw ||
    String(o.label).trim() === raw
  );

  if (!option?.product_id) return { product_id: null, product: null };
  return { product_id: Number(option.product_id), product: option.product ?? null };
}

export function resolveComponentProduct(
  component: { product_id: number | null; product_selection_code?: string | null },
  selections: Array<{ code: string; options: Array<{ value: string | null; code: string; label: string; product_id?: number | null; product?: Product | null }> }>,
  rawValues: Record<string, unknown>,
  products: Map<number, Product>
): { product_id: number | null; product: Product | null; source: 'FIXED' | 'OPTION' | 'MISSING' } {
  if (component.product_selection_code?.trim()) {
    const selection = selections.find(s => s.code === component.product_selection_code?.trim());
    if (!selection) return { product_id: null, product: null, source: 'MISSING' };
    const resolved = resolveOtdOptionProduct(selection.options, rawValues[selection.code]);
    if (!resolved.product_id) return { product_id: null, product: null, source: 'MISSING' };
    return {
      product_id: resolved.product_id,
      product: resolved.product ?? products.get(resolved.product_id) ?? null,
      source: 'OPTION',
    };
  }

  if (component.product_id) {
    const product = products.get(Number(component.product_id)) ?? null;
    return { product_id: Number(component.product_id), product, source: product ? 'FIXED' : 'MISSING' };
  }

  return { product_id: null, product: null, source: 'MISSING' };
}
