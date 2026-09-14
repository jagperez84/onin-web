import { describe, it, expect } from 'vitest';
import { calculateLinePricing, resolveProductUnitPrice, round2, formatEuro } from './productPricingService';
import type { Product, ProductCharacteristic } from './productRepository';
import type { ProductScaleRow } from './productCommercialRepository';

function baseProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 1,
    company_id: 1,
    code: 'TOLDO-01',
    technical_description: 'Toldo capota',
    commercial_description: 'Toldo capota',
    family_id: null,
    product_type_id: null,
    base_unit_id: null,
    sales_price: 100,
    purchase_price: 50,
    stock_enabled: false,
    allow_negative_stock: false,
    active: true,
    notes: null,
    price_increment: 0,
    upc: 0,
    ptc: 0,
    stock_minimum: 0,
    minimum_remainder: null,
    smooth_cut: false,
    usage_status: 'ACTIVE',
    iva_percent: 21,
    default_supplier_party_id: null,
    include_measurements_in_stock: false,
    include_stock_by_color: false,
    scaled: false,
    scaled_by_characteristic: false,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

function baseCharacteristic(overrides: Partial<ProductCharacteristic> = {}): ProductCharacteristic {
  return {
    id: 10,
    product_id: 1,
    code: 'BLANCO',
    description: 'Blanco',
    upc: null,
    ptc: null,
    pvp: null,
    price_increment: 0,
    stock_minimum: 0,
    active: true,
    scaled: false,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

function baseScale(overrides: Partial<ProductScaleRow> = {}): ProductScaleRow {
  return {
    id: 1,
    product_id: 1,
    dimension_values: [2000, 1500],
    dimension_1: 2000,
    dimension_2: 1500,
    price: 250,
    characteristic_id: null,
    attribute_values: {},
    characteristic_code: null,
    characteristic_description: null,
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

describe('round2', () => {
  it('redondea a dos decimales evitando errores de coma flotante', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.345)).toBe(2.35);
    expect(round2(10 / 3)).toBe(3.33);
  });
});

describe('resolveProductUnitPrice', () => {
  it('usa el precio base del artículo cuando no hay característica ni escalado', () => {
    const result = resolveProductUnitPrice({ product: baseProduct({ sales_price: 123.456 }) });
    expect(result.source).toBe('base');
    expect(result.price).toBe(123.46);
    expect(result.missing).toBe(false);
  });

  it('usa el PVP de la característica cuando está definido y es mayor que 0', () => {
    const result = resolveProductUnitPrice({
      product: baseProduct({ sales_price: 100 }),
      characteristic: baseCharacteristic({ pvp: 150 }),
    });
    expect(result.source).toBe('characteristic');
    expect(result.price).toBe(150);
  });

  it('ignora el PVP de la característica si es 0 o nulo y cae al precio base', () => {
    const result = resolveProductUnitPrice({
      product: baseProduct({ sales_price: 100 }),
      characteristic: baseCharacteristic({ pvp: 0 }),
    });
    expect(result.source).toBe('base');
    expect(result.price).toBe(100);
  });

  it('escoge el escalón de escalado correcto por dimensiones (el más ajustado que cubre la medida)', () => {
    const scales = [
      baseScale({ id: 1, dimension_1: 1000, dimension_2: 1000, price: 100 }),
      baseScale({ id: 2, dimension_1: 2000, dimension_2: 2000, price: 200 }),
      baseScale({ id: 3, dimension_1: 3000, dimension_2: 3000, price: 300 }),
    ];
    const result = resolveProductUnitPrice({
      product: baseProduct({ scaled: true }),
      scales,
      dimension1: 1500,
      dimension2: 1500,
    });
    expect(result.source).toBe('scale');
    expect(result.scale?.id).toBe(2);
    expect(result.price).toBe(200);
  });

  it('devuelve missing=true cuando ningún escalón cubre las dimensiones pedidas', () => {
    const scales = [baseScale({ dimension_1: 1000, dimension_2: 1000, price: 100 })];
    const result = resolveProductUnitPrice({
      product: baseProduct({ scaled: true }),
      scales,
      dimension1: 5000,
      dimension2: 5000,
    });
    expect(result.missing).toBe(true);
    expect(result.price).toBe(0);
    expect(result.missingReason).toBeTruthy();
  });

  it('en escalado por característica, exige que el escalón coincida con la característica seleccionada', () => {
    const scales = [
      baseScale({ id: 1, characteristic_id: 10, dimension_1: 2000, dimension_2: null, price: 100 }),
      baseScale({ id: 2, characteristic_id: 20, dimension_1: 2000, dimension_2: null, price: 999 }),
    ];
    const result = resolveProductUnitPrice({
      product: baseProduct({ scaled_by_characteristic: true }),
      characteristic: baseCharacteristic({ id: 10 }),
      scales,
      dimension1: 1500,
    });
    expect(result.source).toBe('scale_characteristic');
    expect(result.scale?.id).toBe(1);
    expect(result.price).toBe(100);
  });

  it('cuando la característica no tiene ningún escalón definido, usa el PVP plano en vez de marcar el precio como pendiente', () => {
    const scales = [baseScale({ id: 1, characteristic_id: 20, dimension_1: 2000, price: 999 })];
    const result = resolveProductUnitPrice({
      product: baseProduct({ scaled_by_characteristic: true }),
      characteristic: baseCharacteristic({ id: 10, pvp: 75 }),
      scales,
      dimension1: 1500,
    });
    expect(result.missing).toBe(false);
    expect(result.source).toBe('characteristic');
    expect(result.price).toBe(75);
  });

  it('cuando la característica no tiene escalón ni PVP propio, cae al precio base del artículo', () => {
    const result = resolveProductUnitPrice({
      product: baseProduct({ scaled_by_characteristic: true, sales_price: 42 }),
      characteristic: baseCharacteristic({ id: 10, pvp: null }),
      scales: [],
      dimension1: 1500,
    });
    expect(result.missing).toBe(false);
    expect(result.source).toBe('base');
    expect(result.price).toBe(42);
  });

  it('si la característica sí tiene escalón definido pero ninguno cubre la dimensión pedida, el precio sigue pendiente (no cae al plano)', () => {
    const scales = [baseScale({ id: 1, characteristic_id: 10, dimension_1: 1000, price: 100 })];
    const result = resolveProductUnitPrice({
      product: baseProduct({ scaled_by_characteristic: true }),
      characteristic: baseCharacteristic({ id: 10, pvp: 75 }),
      scales,
      dimension1: 5000,
    });
    expect(result.missing).toBe(true);
    expect(result.price).toBe(0);
  });

  it('un escalón con atributos exigidos no aplica si los valores seleccionados no coinciden', () => {
    const scales = [
      baseScale({
        id: 1,
        dimension_1: 1000,
        dimension_2: null,
        price: 999,
        attribute_values: { '5': 'MOTOR' },
      }),
      baseScale({ id: 2, dimension_1: 1000, dimension_2: null, price: 150, attribute_values: {} }),
    ];
    const result = resolveProductUnitPrice({
      product: baseProduct({ scaled: true }),
      scales,
      dimension1: 500,
      selectedAttributeValues: { '5': 'MANUAL' },
    });
    // El escalón con atributo MOTOR no coincide con lo seleccionado (MANUAL),
    // así que debe aplicarse el escalón sin restricciones de atributo.
    expect(result.scale?.id).toBe(2);
    expect(result.price).toBe(150);
  });
});

describe('calculateLinePricing', () => {
  it('calcula el desglose completo de una línea sin descuento ni incrementos', () => {
    const result = calculateLinePricing({
      product: baseProduct({ sales_price: 100 }),
      quantity: 2,
      discount_percent: 0,
      tax_percent: 21,
    });
    expect(result.base_price).toBe(100);
    expect(result.unit_price).toBe(100);
    expect(result.net_amount).toBe(200);
    expect(result.tax_amount).toBe(42);
    expect(result.total_amount).toBe(242);
  });

  it('aplica el incremento de precio de la característica antes del descuento', () => {
    const result = calculateLinePricing({
      product: baseProduct({ sales_price: 100 }),
      characteristic: baseCharacteristic({ price_increment: 20 }),
      quantity: 1,
      discount_percent: 0,
      tax_percent: 0,
    });
    expect(result.total_increments).toBe(20);
    expect(result.price_before_discount).toBe(120);
    expect(result.unit_price).toBe(120);
  });

  it('el incremento base del artículo solo aplica si la característica no trae uno propio', () => {
    const withoutCharIncrement = calculateLinePricing({
      product: baseProduct({ sales_price: 100, price_increment: 15 }),
      characteristic: baseCharacteristic({ price_increment: 0 }),
      quantity: 1,
      discount_percent: 0,
    });
    expect(withoutCharIncrement.total_increments).toBe(15);

    const withCharIncrement = calculateLinePricing({
      product: baseProduct({ sales_price: 100, price_increment: 15 }),
      characteristic: baseCharacteristic({ price_increment: 20 }),
      quantity: 1,
      discount_percent: 0,
    });
    // Solo debe contar el incremento de la característica (20), no la suma
    // de ambos (35): el incremento base del artículo queda anulado.
    expect(withCharIncrement.total_increments).toBe(20);
  });

  it('aplica el descuento sobre el precio ya incrementado, no sobre el precio base', () => {
    const result = calculateLinePricing({
      product: baseProduct({ sales_price: 100 }),
      characteristic: baseCharacteristic({ price_increment: 100 }),
      quantity: 1,
      discount_percent: 10,
    });
    // price_before_discount = 200, 10% de descuento = 20 -> unit_price 180
    expect(result.price_before_discount).toBe(200);
    expect(result.discount_amount).toBe(20);
    expect(result.unit_price).toBe(180);
  });

  it('acota el porcentaje de descuento al rango [0, 100]', () => {
    const over = calculateLinePricing({ product: baseProduct({ sales_price: 100 }), quantity: 1, discount_percent: 150 });
    expect(over.discount_percent).toBe(100);
    expect(over.unit_price).toBe(0);

    const under = calculateLinePricing({ product: baseProduct({ sales_price: 100 }), quantity: 1, discount_percent: -20 });
    expect(under.discount_percent).toBe(0);
    expect(under.unit_price).toBe(100);
  });

  it('nunca deja un precio unitario negativo aunque el descuento supere el 100% acotado', () => {
    const result = calculateLinePricing({ product: baseProduct({ sales_price: 100 }), quantity: 1, discount_percent: 100 });
    expect(result.unit_price).toBe(0);
    expect(result.net_amount).toBe(0);
  });

  it('trata una cantidad negativa como cero en vez de generar importes negativos', () => {
    const result = calculateLinePricing({ product: baseProduct({ sales_price: 100 }), quantity: -5, discount_percent: 0 });
    expect(result.quantity).toBe(0);
    expect(result.net_amount).toBe(0);
    expect(result.total_amount).toBe(0);
  });

  it('acota un porcentaje de IVA negativo a cero', () => {
    const result = calculateLinePricing({ product: baseProduct({ sales_price: 100 }), quantity: 1, discount_percent: 0, tax_percent: -21 });
    expect(result.tax_percent).toBe(0);
    expect(result.tax_amount).toBe(0);
  });

  it('propaga price_missing cuando el escalado no cubre las dimensiones', () => {
    const result = calculateLinePricing({
      product: baseProduct({ scaled: true, sales_price: 100 }),
      scales: [baseScale({ dimension_1: 500, dimension_2: 500, price: 50 })],
      dimensions: { ancho: 5000, alto: 5000 },
      quantity: 1,
      discount_percent: 0,
    });
    expect(result.price_missing).toBe(true);
    expect(result.base_price).toBe(0);
  });

  it('redondea el neto por cantidad, no cantidad por precio ya redondeado en cascada (consistencia numérica)', () => {
    // 3 unidades a 33.333 -> unit_price se redondea a 33.33, pero el neto
    // final se calcula con quantity * unitPrice, no re-redondeando cada paso.
    const result = calculateLinePricing({
      product: baseProduct({ sales_price: 33.333 }),
      quantity: 3,
      discount_percent: 0,
    });
    expect(result.unit_price).toBe(33.33);
    expect(result.net_amount).toBe(99.99);
  });
});

describe('formatEuro', () => {
  it('formatea en euros con formato español', () => {
    expect(formatEuro(1234.5)).toContain('€');
  });
});
