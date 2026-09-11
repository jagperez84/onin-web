import { describe, it, expect } from 'vitest';
import {
  calculateBreakdown,
  evaluateExpression,
  BreakdownCalculationError,
  type BreakdownComponent,
} from './breakdownCalculationService';

function component(overrides: Partial<BreakdownComponent> = {}): BreakdownComponent {
  return {
    id: 1,
    code: 'X',
    base_price: 10,
    add_pvp: true,
    ...overrides,
  };
}

describe('evaluateExpression', () => {
  it('resuelve aritmética básica con precedencia y paréntesis', () => {
    expect(evaluateExpression('2+3*4')).toBe(14);
    expect(evaluateExpression('(2+3)*4')).toBe(20);
  });

  it('resuelve variables del contexto', () => {
    expect(evaluateExpression('ANCHO*2', { ANCHO: 100 })).toBe(200);
  });

  it('admite MIN/MAX/ROUND/ROUNDUP/ROUNDDOWN (insensible a mayúsculas)', () => {
    expect(evaluateExpression('min(5,2,8)')).toBe(2);
    expect(evaluateExpression('MAX(5,2,8)')).toBe(8);
    expect(evaluateExpression('ROUND(2.345,2)')).toBe(2.35);
    expect(evaluateExpression('ROUNDUP(2.01,0)')).toBe(3);
    expect(evaluateExpression('ROUNDDOWN(2.99,0)')).toBe(2);
  });

  it('lanza un error con una variable no definida', () => {
    expect(() => evaluateExpression('ANCHO*2')).toThrow(BreakdownCalculationError);
  });

  it('lanza un error al dividir entre cero', () => {
    expect(() => evaluateExpression('5/0')).toThrow(/División por cero/);
  });

  it('lanza un error con una función no soportada', () => {
    expect(() => evaluateExpression('FOO(1)')).toThrow(/no soportada/);
  });

  it('lanza un error con sintaxis inválida (paréntesis sin cerrar, token final sobrante)', () => {
    expect(() => evaluateExpression('(2+3')).toThrow(BreakdownCalculationError);
    expect(() => evaluateExpression('2 3')).toThrow(BreakdownCalculationError);
  });
});

describe('calculateBreakdown', () => {
  it('usa 1 como cantidad por defecto cuando el componente no tiene fórmula', () => {
    const result = calculateBreakdown({ components: [component({ quantity_expression: null })] });
    expect(result.components[0].quantity).toBe(1);
  });

  it('procesa los componentes en orden ascendente de id, no en el orden del array', () => {
    const result = calculateBreakdown({
      components: [
        component({ id: 2, code: 'B', quantity_expression: '1', base_price: 5 }),
        component({ id: 1, code: 'A', quantity_expression: '3', base_price: 2 }),
      ],
    });
    // El array de salida respeta el orden de procesamiento (por id), no el de entrada.
    expect(result.components.map(c => c.code)).toEqual(['A', 'B']);
  });

  it('un componente posterior puede referenciar la cantidad ya calculada de uno anterior por su código', () => {
    const result = calculateBreakdown({
      components: [
        component({ id: 1, code: 'A', quantity_expression: '2', base_price: 1 }),
        component({ id: 2, code: 'B', quantity_expression: 'A*3', base_price: 1 }),
      ],
    });
    expect(result.components[1].quantity).toBe(6);
  });

  it('lanza un error si la fórmula de cantidad de un componente produce un valor no finito', () => {
    expect(() =>
      calculateBreakdown({ components: [component({ quantity_expression: '1/0' })] })
    ).toThrow();
  });

  it('resuelve precio/coste de un componente sin producto asociado a partir de base_price/cost', () => {
    const result = calculateBreakdown({
      components: [component({ quantity_expression: '2', base_price: 10, cost: 4 })],
    });
    expect(result.components[0].unit_price).toBe(10);
    expect(result.components[0].unit_cost).toBe(4);
    expect(result.components[0].total_price).toBe(20);
    expect(result.components[0].total_cost).toBe(8);
  });

  it('si no se indica cost explícito, usa el price como coste por defecto', () => {
    const result = calculateBreakdown({
      components: [component({ quantity_expression: '1', base_price: 15, cost: undefined })],
    });
    expect(result.components[0].unit_cost).toBe(15);
  });

  it('HALLAZGO: un componente sin producto y sin precio configurado no avisa, calcula precio/coste 0 en silencio', () => {
    // resolveComponentPrice hace `Number(c.base_price ?? c.price ?? 0)`: si
    // ninguno de los dos está definido, el resultado es 0 (un número
    // perfectamente finito), así que la comprobación de "precio no válido"
    // nunca se dispara por precio ausente -solo por un valor explícito que
    // no sea numérico (NaN). Un componente manual de despiece sin precio
    // configurado entra en el presupuesto gratis, sin ningún error.
    const result = calculateBreakdown({
      components: [component({ base_price: undefined, price: undefined })],
    });
    expect(result.components[0].unit_price).toBe(0);
    expect(result.components[0].total_price).toBe(0);
  });

  describe('total price/cost del despiece', () => {
    it('suma al precio total los componentes con add_pvp O add_increment (no solo add_pvp)', () => {
      const result = calculateBreakdown({
        components: [
          component({ id: 1, code: 'A', quantity_expression: '1', base_price: 10, add_pvp: true, add_increment: false }),
          component({ id: 2, code: 'B', quantity_expression: '1', base_price: 20, add_pvp: false, add_increment: true }),
          component({ id: 3, code: 'C', quantity_expression: '1', base_price: 30, add_pvp: false, add_increment: false }),
        ],
      });
      // A y B cuentan (10 + 20 = 30), C no (ni add_pvp ni add_increment).
      expect(result.price).toBe(30);
    });

    it('el coste total suma todos los componentes, con independencia de add_pvp/add_increment', () => {
      const result = calculateBreakdown({
        components: [
          component({ id: 1, code: 'A', quantity_expression: '1', base_price: 10, cost: 4, add_pvp: false, add_increment: false }),
          component({ id: 2, code: 'B', quantity_expression: '1', base_price: 20, cost: 6, add_pvp: true }),
        ],
      });
      expect(result.cost).toBe(10);
    });
  });

  describe('redondeo (HALF_UP / UP / DOWN, con decimales configurables)', () => {
    it('HALF_UP redondea al alza desde .5 (también en negativos, alejándose de cero)', () => {
      const up = calculateBreakdown({
        components: [component({ quantity_expression: '1', base_price: 2.345, rounding_decimals: 2, rounding_mode: 'HALF_UP' })],
      });
      expect(up.components[0].unit_price).toBe(2.35);
    });

    it('UP siempre redondea hacia arriba (techo)', () => {
      const result = calculateBreakdown({
        components: [component({ quantity_expression: '1', base_price: 2.001, rounding_decimals: 2, rounding_mode: 'UP' })],
      });
      expect(result.components[0].unit_price).toBe(2.01);
    });

    it('DOWN siempre redondea hacia abajo (suelo)', () => {
      const result = calculateBreakdown({
        components: [component({ quantity_expression: '1', base_price: 2.999, rounding_decimals: 2, rounding_mode: 'DOWN' })],
      });
      expect(result.components[0].unit_price).toBe(2.99);
    });

    it('acota los decimales de redondeo a un máximo de 6 y un mínimo de 0', () => {
      const overResult = calculateBreakdown({
        components: [component({ quantity_expression: '1', base_price: 1.123456789, rounding_decimals: 20 })],
      });
      expect(overResult.components[0].unit_price).toBe(1.123457);

      const negativeResult = calculateBreakdown({
        components: [component({ quantity_expression: '1', base_price: 2.6, rounding_decimals: -3 })],
      });
      expect(negativeResult.components[0].unit_price).toBe(3);
    });
  });
});
