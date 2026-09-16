import { describe, it, expect, afterEach } from 'vitest';
import { calculateBillOfMaterials, evaluateFormula, evaluateFormulaWithDiagnostics, type BomComponentDefinition } from './billOfMaterialsService';

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

  it('una variable inexistente en el contexto cae a 1, pero evaluateFormulaWithDiagnostics informa del error', () => {
    // evaluateFormula() (usada directamente) mantiene el valor de respaldo 1
    // por compatibilidad, pero calculateBillOfMaterials() ya no consume esta
    // función a ciegas: usa evaluateFormulaWithDiagnostics() y expone el
    // fallo en formula_errors (ver describe('calculateBillOfMaterials')
    // más abajo) en vez de tragárselo en silencio.
    expect(evaluateFormula('VARIABLE_QUE_NO_EXISTE*2', { ANCHO: 100 })).toBe(1);
    const diagnostics = evaluateFormulaWithDiagnostics('VARIABLE_QUE_NO_EXISTE*2', { ANCHO: 100 });
    expect(diagnostics.value).toBe(1);
    expect(diagnostics.error).toMatch(/no está definida/);
  });

  it('una división entre cero cae a 1 (Infinity no es finito), y el error queda reflejado en el diagnóstico', () => {
    expect(evaluateFormula('5/0', {})).toBe(1);
    const diagnostics = evaluateFormulaWithDiagnostics('5/0', {});
    expect(diagnostics.value).toBe(1);
    expect(diagnostics.error).toBeTruthy();
  });

  it('una sintaxis no reconocida por la gramática (comillas, corchetes, punto y coma) cae a 1', () => {
    expect(evaluateFormula('"a"', {})).toBe(1);
    expect(evaluateFormula('[1,2]', {})).toBe(1);
    expect(evaluateFormula('1;2', {})).toBe(1);
  });

  it('admite comparaciones (< <= > >= == != === !==) y condicional ternario', () => {
    expect(evaluateFormula('5>3?1:0', {})).toBe(1);
    expect(evaluateFormula('5<3?1:0', {})).toBe(0);
    expect(evaluateFormula('ANCHO>=2000?ANCHO*2:ANCHO', { ANCHO: 2500 })).toBe(5000);
    expect(evaluateFormula('3==3?10:20', {})).toBe(10);
    expect(evaluateFormula('3!=3?10:20', {})).toBe(20);
  });

  describe('REGRESIÓN DE SEGURIDAD: ya no ejecuta JavaScript arbitrario (corregido)', () => {
    // El evaluador original delegaba en `new Function(...)` tras un simple
    // filtro de caracteres permitidos (letras, puntos, paréntesis, coma y
    // "="). Ese filtro no bloqueaba una asignación real a una variable
    // global -y con más esfuerzo, JavaScript arbitrario sin comillas-, lo
    // que era una inyección de código persistente: quantity_expression de
    // un componente de despiece lo escribe quien edita el artículo/OTD, y
    // se evaluaba automáticamente en el navegador de cualquier comercial
    // que abriera un presupuesto que usara ese artículo.
    //
    // El evaluador actual es un parser recursivo-descendente propio (mismo
    // patrón que src/services/otd/formulaEngine.ts): nunca convierte texto
    // en código ejecutable, así que este payload ya no tiene ningún efecto
    // -ni siquiera llega a "verse" como una asignación, es simplemente una
    // sintaxis que la gramática no reconoce y descarta.
    afterEach(() => {
      delete (globalThis as Record<string, unknown>).__bomEvalPoc;
    });

    it('el mismo payload que antes ejecutaba una asignación global ahora no tiene ningún efecto', () => {
      const result = evaluateFormula('(globalThis.__bomEvalPoc=1,1)', {});
      expect((globalThis as Record<string, unknown>).__bomEvalPoc).toBeUndefined();
      expect(result).toBe(1); // cae al valor por defecto, como cualquier fórmula inválida
    });

    it('un identificador de función no soportada (p. ej. Function/eval) se trata como variable inexistente, no se invoca', () => {
      expect(evaluateFormula('Function(1)', {})).toBe(1);
      expect(evaluateFormula('eval(1)', {})).toBe(1);
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

  it('no reporta formula_errors cuando todas las fórmulas evalúan bien (incluida la ausencia de fórmula)', () => {
    const result = calculateBillOfMaterials({
      components: [component({ quantity_expression: null }), component({ id: 2, quantity_expression: 'ANCHO*2' })],
      dimensions: { ancho: 100 },
      quantity: 1,
    });
    expect(result.formula_errors).toHaveLength(0);
  });

  it('reporta en formula_errors el componente cuya fórmula referencia una variable inexistente, sin dejar de calcular el resto', () => {
    const result = calculateBillOfMaterials({
      components: [
        component({ id: 1, code: 'MAL', quantity_expression: 'VARIABLE_QUE_NO_EXISTE' }),
        component({ id: 2, code: 'BIEN', quantity_expression: 'ANCHO*2' }),
      ],
      dimensions: { ancho: 100 },
      quantity: 1,
    });
    expect(result.formula_errors).toHaveLength(1);
    expect(result.formula_errors[0].component_code).toBe('MAL');
    expect(result.formula_errors[0].expression).toBe('VARIABLE_QUE_NO_EXISTE');
    // El componente afectado sigue calculándose (cae a cantidad 1) en vez de romper todo el despiece.
    expect(result.components.find((c) => c.code === 'MAL')?.quantity).toBe(1);
    // El resto de componentes con fórmulas válidas no se ven afectados.
    expect(result.components.find((c) => c.code === 'BIEN')?.quantity).toBe(200);
  });
});
