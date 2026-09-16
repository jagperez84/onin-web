import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: { from: mockFrom } }));

import { checkStockAvailability } from './stockAvailabilityService';

type TableResult = { data: unknown; error: unknown };

function chainable(result: TableResult) {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

function mockTables(tables: {
  warehouse?: TableResult;
  warehouse_stock?: TableResult;
  warehouse_stock_item?: TableResult;
}) {
  mockFrom.mockImplementation((table: string) => {
    const result = (tables as Record<string, TableResult | undefined>)[table] ?? { data: [], error: null };
    return chainable(result);
  });
}

const baseInput = {
  companyId: 1,
  productId: 100,
  productCode: 'ART-1',
  productName: 'Artículo 1',
  stockEnabled: true,
  quantity: 5,
};

beforeEach(() => {
  mockFrom.mockReset();
});

describe('checkStockAvailability', () => {
  it('si el artículo no tiene control de stock, devuelve "untracked" sin consultar la base de datos', async () => {
    const result = await checkStockAvailability({ ...baseInput, stockEnabled: false });
    expect(result.overallStatus).toBe('untracked');
    expect(result.mainProduct.status).toBe('untracked');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('devuelve "available" cuando el stock disponible cubre la cantidad requerida', async () => {
    mockTables({
      warehouse_stock: {
        data: [{ warehouse_id: 1, product_id: 100, characteristic_id: null, quantity: 20, reserved_quantity: 5 }],
        error: null,
      },
    });
    const result = await checkStockAvailability(baseInput);
    expect(result.mainProduct.inStock).toBe(20);
    expect(result.mainProduct.reserved).toBe(5);
    expect(result.mainProduct.available).toBe(15);
    expect(result.mainProduct.status).toBe('available');
    expect(result.mainProduct.hasSufficientStock).toBe(true);
    expect(result.overallStatus).toBe('available');
  });

  it('devuelve "out_of_stock" cuando el disponible es 0', async () => {
    mockTables({
      warehouse_stock: { data: [{ warehouse_id: 1, product_id: 100, characteristic_id: null, quantity: 0, reserved_quantity: 0 }], error: null },
    });
    const result = await checkStockAvailability(baseInput);
    expect(result.mainProduct.status).toBe('out_of_stock');
    expect(result.mainProduct.hasSufficientStock).toBe(false);
  });

  it('devuelve "low_stock" cuando hay algo de disponible pero no cubre lo requerido', async () => {
    mockTables({
      warehouse_stock: { data: [{ warehouse_id: 1, product_id: 100, characteristic_id: null, quantity: 3, reserved_quantity: 0 }], error: null },
    });
    const result = await checkStockAvailability(baseInput); // requiere 5, hay 3
    expect(result.mainProduct.status).toBe('low_stock');
    expect(result.mainProduct.hasSufficientStock).toBe(false);
  });

  it('con stock suficiente pero por debajo del mínimo tras la reserva, degrada a "low_stock"', async () => {
    mockTables({
      warehouse_stock: { data: [{ warehouse_id: 1, product_id: 100, characteristic_id: null, quantity: 6, reserved_quantity: 0 }], error: null },
    });
    // requiere 5, hay 6 disponibles -> sobran 1, pero el mínimo configurado es 3
    const result = await checkStockAvailability({ ...baseInput, stockMinimum: 3 });
    expect(result.mainProduct.hasSufficientStock).toBe(true); // cubre lo pedido...
    expect(result.mainProduct.status).toBe('low_stock'); // ...pero deja el almacén por debajo del mínimo
  });

  it('nunca deja "available" en negativo aunque lo reservado supere el stock físico', async () => {
    mockTables({
      warehouse_stock: { data: [{ warehouse_id: 1, product_id: 100, characteristic_id: null, quantity: 5, reserved_quantity: 8 }], error: null },
    });
    const result = await checkStockAvailability(baseInput);
    expect(result.mainProduct.available).toBe(0);
    expect(result.mainProduct.status).toBe('out_of_stock');
  });

  it('suma balances de varios almacenes cuando no se filtra por uno concreto', async () => {
    mockTables({
      warehouse_stock: {
        data: [
          { warehouse_id: 1, product_id: 100, characteristic_id: null, quantity: 3, reserved_quantity: 0 },
          { warehouse_id: 2, product_id: 100, characteristic_id: null, quantity: 4, reserved_quantity: 0 },
        ],
        error: null,
      },
    });
    const result = await checkStockAvailability(baseInput);
    expect(result.mainProduct.inStock).toBe(7);
  });

  it('un characteristic_id null en la fila de stock NO cuenta para una característica concreta pedida (evita sobreestimar disponibilidad)', async () => {
    // Antes el filtro era un OR laxo (characteristicIdX==null || match || b.characteristic_id==null)
    // que trataba cualquier fila sin característica como comodín para cualquier característica
    // pedida, sobreestimando el stock disponible de una característica concreta. Ahora la
    // comparación es de igualdad estricta, igual que el IS NOT DISTINCT FROM de los RPC en SQL:
    // una fila sin característica solo cuenta cuando lo pedido tampoco especifica ninguna.
    mockTables({
      warehouse_stock: { data: [{ warehouse_id: 1, product_id: 100, characteristic_id: null, quantity: 10, reserved_quantity: 0 }], error: null },
    });
    const result = await checkStockAvailability({ ...baseInput, characteristicId: 42 });
    expect(result.mainProduct.inStock).toBe(0);
  });

  describe('stock dimensional (piezas cortadas a medida)', () => {
    it('sin recorte permitido (recuttable=false), exige coincidencia exacta de dimensiones', async () => {
      mockTables({
        warehouse_stock: { data: [], error: null },
        warehouse_stock_item: {
          data: [
            { id: 1, product_id: 100, characteristic_id: null, quantity: 2, dimension_values: [2000, 1500], warehouse_stock: { warehouse_id: 1 } },
            { id: 2, product_id: 100, characteristic_id: null, quantity: 3, dimension_values: [2500, 1500], warehouse_stock: { warehouse_id: 1 } },
          ],
          error: null,
        },
      });
      const result = await checkStockAvailability({
        ...baseInput,
        includeMeasurementsInStock: true,
        dimensionValues: [2000, 1500],
        recuttable: false,
        quantity: 2,
      });
      expect(result.mainProduct.dimensional).toBe(true);
      expect(result.mainProduct.available).toBe(2); // solo la pieza con dimensiones exactas
      expect(result.mainProduct.matchingStockItemIds).toEqual([1]);
    });

    it('con recorte permitido (recuttable=true), acepta cualquier pieza igual o mayor', async () => {
      mockTables({
        warehouse_stock: { data: [], error: null },
        warehouse_stock_item: {
          data: [
            { id: 1, product_id: 100, characteristic_id: null, quantity: 2, dimension_values: [1800, 1500], warehouse_stock: { warehouse_id: 1 } },
            { id: 2, product_id: 100, characteristic_id: null, quantity: 3, dimension_values: [2500, 1600], warehouse_stock: { warehouse_id: 1 } },
          ],
          error: null,
        },
      });
      const result = await checkStockAvailability({
        ...baseInput,
        includeMeasurementsInStock: true,
        dimensionValues: [2000, 1500],
        recuttable: true,
        quantity: 3,
      });
      // La pieza 1 (1800x1500) es más pequeña en el primer eje -> no sirve.
      // La pieza 2 (2500x1600) es igual o mayor en ambos ejes -> sirve.
      expect(result.mainProduct.matchingStockItemIds).toEqual([2]);
      expect(result.mainProduct.available).toBe(3);
    });

    it('un número de dimensiones distinto entre la pieza y lo requerido nunca coincide', async () => {
      mockTables({
        warehouse_stock: { data: [], error: null },
        warehouse_stock_item: {
          data: [{ id: 1, product_id: 100, characteristic_id: null, quantity: 5, dimension_values: [2000], warehouse_stock: { warehouse_id: 1 } }],
          error: null,
        },
      });
      const result = await checkStockAvailability({
        ...baseInput,
        includeMeasurementsInStock: true,
        dimensionValues: [2000, 1500],
        recuttable: true,
      });
      expect(result.mainProduct.available).toBe(0);
    });
  });

  describe('componentes y estado global', () => {
    it('el estado global es "out_of_stock" si cualquier componente lo está, aunque el principal esté disponible', async () => {
      mockTables({
        warehouse_stock: {
          data: [
            { warehouse_id: 1, product_id: 100, characteristic_id: null, quantity: 50, reserved_quantity: 0 },
            { warehouse_id: 1, product_id: 200, characteristic_id: null, quantity: 0, reserved_quantity: 0 },
          ],
          error: null,
        },
      });
      const result = await checkStockAvailability({
        ...baseInput,
        components: [{ productId: 200, productCode: 'COMP-1', requiredQuantity: 1 }],
      });
      expect(result.mainProduct.status).toBe('available');
      expect(result.componentsStock[0].status).toBe('out_of_stock');
      expect(result.overallStatus).toBe('out_of_stock');
    });

    it('el estado global es "low_stock" cuando ningún componente está agotado pero alguno está bajo', async () => {
      mockTables({
        warehouse_stock: {
          data: [
            { warehouse_id: 1, product_id: 100, characteristic_id: null, quantity: 50, reserved_quantity: 0 },
            { warehouse_id: 1, product_id: 200, characteristic_id: null, quantity: 1, reserved_quantity: 0 },
          ],
          error: null,
        },
      });
      const result = await checkStockAvailability({
        ...baseInput,
        components: [{ productId: 200, productCode: 'COMP-1', requiredQuantity: 2 }],
      });
      expect(result.overallStatus).toBe('low_stock');
    });
  });
});
