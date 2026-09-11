import { describe, it, expect, afterEach } from 'vitest';
import { calculateBillOfMaterials, evaluateFormula, type BomComponentDefinition } from './billOfMaterialsService';

function component(overrides: Partial<BomComponentDefinition> = {}): BomComponentDefinition {
  return {
    id: 1,
    code: 'LONA',
    description: 'Lona principal',
    quantity_expression: '1',
    unit_id: null,
    product_id: null,
    unit_price: 10,
    unit_cost: 5,
    add_pvp: true,
    add_increment: false,
    ...overrides,
  };
}

describe('evaluateFormula (billOfMaterialsService)', () => {
  it('devuelve 1 para una expresión vacía', () => {
    expect(evaluateFormula('', {})).toBe(1);
    expect(evaluateFormula('  ', {})).toBe(1);
  });

  it('evalúa un número literal directamente', () => {
    expect(evaluateFormula('3.5', {})).toBe(3.5);
  });

  it('evalúa aritmética con variables del contexto', () => {
    expect(evaluateFormula('ANCHO*2', { ANCHO: 100 })).toBe(200);
  });

  it('admite los alias de función en minúsculas y mayúsculas (MIN/MAX/CEIL/FLOOR/ROUND/ABS/SQRT)', () => {
    expect(evaluateFormula('ceil(2.1)', {})).toBe(3);
    expect(evaluateFormula('CEIL(2.1)', {})).toBe(3);
    expect(evaluateFormula('max(1,5,3)', {})).toBe(5);
    expect(evaluateFormula('min(1,5,3)', {})).toBe(1);
    expect(evaluateFormula('floor(2.9)', {})).toBe(2);
    expect(evaluateFormula('round(2.5)', {})).toBe(3);
    expect(evaluateFormula('abs(-5)', {})).toBe(5);
    expect(evaluateFormula('sqrt(9)', {})).toBe(3);
  });

  it('HALLAZGO (silencioso, no lanza error): una variable inexistente en el contexto no falla, cae a 1', () => {
    // A diferencia de src/services/otd/formulaEngine.ts (que lanza un error
    // claro cuando una fórmula referencia un código que no existe), este
    // evaluador atrapa cualquier excepción de ReferenceError y devuelve 1
    // en silencio (solo deja un console.warn). Un typo en el código de una
    // dimensión en un componente de despiece no bloquea nada: simplemente
    // calcula mal la cantidad del componente sin avisar al usuario.
    expect(evaluateFormula('VARIABLE_QUE_NO_EXISTE*2', { ANCHO: 100 })).toBe(1);
  });

  it('HALLAZGO (silencioso): una división entre cero no lanza error, cae a 1 en vez de Infinity', () => {
    // 5/0 en JS da Infinity, que no es Number.isFinite -> el guard `typeof
    // result === 'number' && Number.isFinite(result)` lo descarta y cae a 1
    // sin ningún aviso, igual que el caso anterior.
    expect(evaluateFormula('5/0', {})).toBe(1);
  });

  it('rechaza caracteres no permitidos y cae a 1 (comillas, corchetes, punto y coma)', () => {
    expect(evaluateFormula('"a"', {})).toBe(1);
    expect(evaluateFormula('[1,2]', {})).toBe(1);
    expect(evaluateFormula('1;2', {})).toBe(1);
  });

  describe('HALLAZGO DE SEGURIDAD: no es una gramática cerrada, ejecuta JavaScript arbitrario', () => {
    afterEach(() => {
      delete (globalThis as Record<string, unknown>).__bomEvalPoc;
    });

    it('un carácter en la lista blanca (letras, puntos, paréntesis, "=") basta para ejecutar efectos secundarios reales', () => {
      // Esta fórmula solo usa caracteres "permitidos" por el filtro de
      // evaluateFormula (letras, puntos, paréntesis, coma y "="), así que
      // pasa el saneado y llega a `new Function(...)`. Pero el resultado no
      // es aritmética: es una asignación a una variable global real,
      // ejecutada con el mismo privilegio que el resto del script de la
      // página (localStorage, document.cookie, fetch...).
      //
      // En este proyecto, quantity_expression de un componente de despiece
      // lo escribe quien edita el artículo/OTD; se evalúa automáticamente
      // en el navegador de cualquier comercial que abra un presupuesto que
      // use ese artículo. Es un vector de inyección de código de
      // almacenamiento persistente (stored), no una teoría: la prueba de
      // abajo demuestra la ejecución real de un efecto secundario ajeno a
      // la aritmética esperada.
      const result = evaluateFormula('(globalThis.__bomEvalPoc=1,1)', {});
      expect((globalThis as Record<string, unknown>).__bomEvalPoc).toBe(1);
      expect(result).toBe(1);
    });
  });
});

describe('calculateBillOfMaterials', () => {
  it('usa "1" como cantidad por defecto cuando el componente no tiene fórmula', () => {
    const result = calculateBillOfMaterials({
      components: [component({ quantity_expression: null })],
      dimensions: {},
      quantity: 1,
    });
    expect(result.components[0].quantity).toBe(1);
  });

  it('excluye los componentes marcados como inactivos', () => {
    const result = calculateBillOfMaterials({
      components: [component({ id: 1 }), component({ id: 2, active: false })],
      dimensions: {},
      quantity: 1,
    });
    expect(result.components).toHaveLength(1);
    expect(result.components[0].id).toBe(1);
  });

  it('expone CANTIDAD/QTY/QUANTITY/N y las dimensiones bajo varios alias (D1, DIM1, DIMENSION_1, ANCHO/SALIDA/ALTO)', () => {
    const result = calculateBillOfMaterials({
      components: [component({ quantity_expression: 'ANCHO' })],
      dimensions: { ancho: 2000, salida: 1500, alto: 900 },
      quantity: 3,
    });
    expect(result.formula_variables_used.CANTIDAD).toBe(3);
    expect(result.formula_variables_used.QTY).toBe(3);
    expect(result.formula_variables_used.ANCHO).toBe(2000);
    expect(result.formula_variables_used.SALIDA).toBe(1500);
    expect(result.formula_variables_used.ALTO).toBe(900);
    expect(result.formula_variables_used.D1).toBe(2000);
    expect(result.formula_variables_used.DIM2).toBe(1500);
    expect(result.formula_variables_used.DIMENSION_3).toBe(900);
    expect(result.components[0].quantity).toBe(2000);
  });

  it('no pisa un nombre de dimensión real llamado ANCHO/SALIDA/ALTO con el alias posicional', () => {
    // Si la propia clave de dimensión ya se llama "alto", el fallback
    // posicional (tercer valor -> ALTO) no debe machacarla con un valor
    // distinto.
    const result = calculateBillOfMaterials({
      components: [component()],
      dimensions: { alto: 777 },
      quantity: 1,
    });
    expect(result.formula_variables_used.ALTO).toBe(777);
  });

  it('trata dimensiones nulas como 0 en el contexto de la fórmula', () => {
    const result = calculateBillOfMaterials({
      components: [component({ quantity_expression: 'ANCHO' })],
      dimensions: { ancho: null },
      quantity: 1,
    });
    expect(result.components[0].quantity).toBe(0);
  });

  it('nunca deja una cantidad de componente negativa (la acota a 0)', () => {
    const result = calculateBillOfMaterials({
      components: [component({ quantity_expression: '-5' })],
      dimensions: {},
      quantity: 1,
    });
    expect(result.components[0].quantity).toBe(0);
  });

  it('calcula total_price/total_cost por componente y los acumula en el total del despiece', () => {
    const result = calculateBillOfMaterials({
      components: [
        component({ id: 1, quantity_expression: '2', unit_price: 10, unit_cost: 4, add_pvp: true }),
        component({ id: 2, quantity_expression: '3', unit_price: 20, unit_cost: 8, add_pvp: false }),
      ],
      dimensions: {},
      quantity: 1,
    });
    expect(result.components[0].total_price).toBe(20);
    expect(result.components[1].total_price).toBe(60);
    // Solo el componente 1 tiene add_pvp=true: su precio entra en el total de venta.
    expect(result.total_breakdown_price).toBe(20);
    // El coste se acumula siempre, independientemente de add_pvp.
    expect(result.total_breakdown_cost).toBe(2 * 4 + 3 * 8);
  });

  it('genera un código de respaldo cuando el componente no tiene code propio', () => {
    const result = calculateBillOfMaterials({
      components: [component({ id: 42, code: '', product_code: 'PRD-1' })],
      dimensions: {},
      quantity: 1,
    });
    expect(result.components[0].code).toBe('PRD-1');
  });
});
