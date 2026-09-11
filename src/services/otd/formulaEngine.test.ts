import { describe, it, expect } from 'vitest';
import {
  evaluateFormula,
  extractVariableNames,
  validateFormulaReferences,
  resolveOtdVariables,
  evaluateOtdComponent,
  evaluateOtdConfiguration,
} from './formulaEngine';

describe('evaluateFormula', () => {
  it('devuelve 0 sin dependencias para una expresión vacía o nula', () => {
    expect(evaluateFormula('', {})).toEqual({ value: 0, dependencies: [] });
    expect(evaluateFormula(null, {})).toEqual({ value: 0, dependencies: [] });
    expect(evaluateFormula(undefined, {})).toEqual({ value: 0, dependencies: [] });
    expect(evaluateFormula('   ', {})).toEqual({ value: 0, dependencies: [] });
  });

  it('resuelve aritmética básica y precedencia de operadores', () => {
    expect(evaluateFormula('2+3', {}).value).toBe(5);
    expect(evaluateFormula('2-3', {}).value).toBe(-1);
    expect(evaluateFormula('2*3', {}).value).toBe(6);
    expect(evaluateFormula('6/3', {}).value).toBe(2);
    expect(evaluateFormula('7%3', {}).value).toBe(1);
    expect(evaluateFormula('2+3*4', {}).value).toBe(14);
    expect(evaluateFormula('(2+3)*4', {}).value).toBe(20);
    expect(evaluateFormula('2.5*2', {}).value).toBe(5);
  });

  it('resuelve el signo unario', () => {
    expect(evaluateFormula('-5+3', {}).value).toBe(-2);
    expect(evaluateFormula('-(2+3)', {}).value).toBe(-5);
    expect(evaluateFormula('+5', {}).value).toBe(5);
  });

  it('resuelve variables del contexto y reporta sus dependencias', () => {
    const result = evaluateFormula('ANCHO*2', { ANCHO: 100 });
    expect(result.value).toBe(200);
    expect(result.dependencies).toEqual(['ANCHO']);
  });

  it('distingue mayúsculas/minúsculas en nombres de variable (no en funciones)', () => {
    // El nombre de función se normaliza a mayúsculas antes de comparar con
    // la lista de funciones conocidas, pero un identificador de variable se
    // usa tal cual para buscar en el contexto.
    expect(evaluateFormula('ceil(2.1)', {}).value).toBe(3);
    expect(() => evaluateFormula('ancho', { ANCHO: 100 })).toThrow(
      "La variable 'ancho' no tiene un valor numérico."
    );
  });

  it('lanza un error claro cuando la variable no está en el contexto', () => {
    expect(() => evaluateFormula('ANCHO*2', {})).toThrow(
      "La variable 'ANCHO' no tiene un valor numérico."
    );
  });

  it('lanza un error al dividir o hacer módulo entre cero', () => {
    expect(() => evaluateFormula('5/0', {})).toThrow('No se puede dividir entre cero.');
    expect(() => evaluateFormula('5%0', {})).toThrow('No se puede dividir entre cero.');
  });

  describe('funciones incorporadas', () => {
    it('CEIL / FLOOR / TRUNC / ROUND', () => {
      expect(evaluateFormula('CEIL(2.1)', {}).value).toBe(3);
      expect(evaluateFormula('FLOOR(2.9)', {}).value).toBe(2);
      expect(evaluateFormula('TRUNC(2.9)', {}).value).toBe(2);
      expect(evaluateFormula('TRUNC(-2.9)', {}).value).toBe(-2);
      expect(evaluateFormula('ROUND(2.5)', {}).value).toBe(3);
      expect(evaluateFormula('ROUND(2.345,2)', {}).value).toBe(2.35);
    });

    it('MAX / MIN / ABS / SQRT', () => {
      expect(evaluateFormula('MAX(1,5,3)', {}).value).toBe(5);
      expect(evaluateFormula('MIN(1,5,3)', {}).value).toBe(1);
      expect(evaluateFormula('ABS(-5)', {}).value).toBe(5);
      expect(evaluateFormula('SQRT(9)', {}).value).toBe(3);
      expect(() => evaluateFormula('SQRT(-1)', {})).toThrow(
        'No se puede calcular SQRT de un número negativo.'
      );
    });

    it('conversiones de longitud (TO_M / TO_MM / TO_CM / TO_DM)', () => {
      expect(evaluateFormula('TO_M(1000)', {}).value).toBe(1);
      expect(evaluateFormula('TO_MM(1)', {}).value).toBe(1000);
      expect(evaluateFormula('TO_CM(100)', {}).value).toBe(10);
      expect(evaluateFormula('TO_DM(100)', {}).value).toBe(1);
    });

    it('conversiones de superficie (TO_M2 / TO_CM2 / TO_MM2), con 1 o 2 argumentos', () => {
      expect(evaluateFormula('TO_M2(1000000)', {}).value).toBe(1);
      expect(evaluateFormula('TO_M2(1000,1000)', {}).value).toBe(1);
      expect(evaluateFormula('TO_CM2(100)', {}).value).toBe(1);
      expect(evaluateFormula('TO_CM2(10,10)', {}).value).toBe(1);
      expect(evaluateFormula('TO_MM2(1)', {}).value).toBe(1000000);
      expect(evaluateFormula('TO_MM2(1000,1000)', {}).value).toBe(1000000);
    });

    it('conversiones de peso (TO_KG / TO_G)', () => {
      expect(evaluateFormula('TO_KG(1000)', {}).value).toBe(1);
      expect(evaluateFormula('TO_G(1)', {}).value).toBe(1000);
    });

    it('valida el número de argumentos de cada función', () => {
      expect(() => evaluateFormula('CEIL()', {})).toThrow('CEIL requiere exactamente 1 argumento.');
      expect(() => evaluateFormula('CEIL(1,2)', {})).toThrow('CEIL requiere exactamente 1 argumento.');
      expect(() => evaluateFormula('MAX()', {})).toThrow('MAX requiere al menos 1 argumento.');
      expect(() => evaluateFormula('ROUND(1,2,3)', {})).toThrow('ROUND requiere 1 o 2 argumentos.');
      expect(() => evaluateFormula('TO_M2(1,2,3)', {})).toThrow(
        'TO_M2 requiere 1 o 2 argumentos (ej. TO_M2(ANCHO, ALTO)).'
      );
    });

    it('lanza un error para una función desconocida', () => {
      expect(() => evaluateFormula('FOO(1)', {})).toThrow("Función desconocida 'FOO'.");
    });
  });

  it('lanza un error de sintaxis con paréntesis sin cerrar', () => {
    expect(() => evaluateFormula('(2+3', {})).toThrow(/Falta '\)'/);
  });

  it('lanza un error ante un carácter no permitido', () => {
    expect(() => evaluateFormula('2+3;', {})).toThrow(/Carácter no permitido/);
  });
});

describe('extractVariableNames', () => {
  it('devuelve un array vacío para expresiones vacías o nulas', () => {
    expect(extractVariableNames(null)).toEqual([]);
    expect(extractVariableNames(undefined)).toEqual([]);
    expect(extractVariableNames('')).toEqual([]);
  });

  it('extrae identificadores y filtra las funciones incorporadas (sin distinguir mayúsculas en las funciones)', () => {
    expect(extractVariableNames('CEIL(ANCHO)+ceil(ALTO)')).toEqual(['ANCHO', 'ALTO']);
  });

  it('deduplica nombres repetidos', () => {
    expect(extractVariableNames('ANCHO+ANCHO*2')).toEqual(['ANCHO']);
  });
});

describe('validateFormulaReferences', () => {
  it('no lanza error cuando todas las variables referenciadas están definidas', () => {
    expect(() => validateFormulaReferences('ANCHO*ALTO', ['ANCHO', 'ALTO'])).not.toThrow();
  });

  it('lanza un error con el código exacto de la variable no definida', () => {
    expect(() => validateFormulaReferences('ANCHO*ALTO', ['ANCHO'])).toThrow(
      "La fórmula utiliza la variable 'ALTO', pero no está definida en el OTD."
    );
  });

  it('también detecta errores de sintaxis aunque las variables existan (evalúa con valor ficticio 1)', () => {
    expect(() => validateFormulaReferences('ANCHO+', ['ANCHO'])).toThrow();
  });

  it('una fórmula con división entre cero literal falla incluso en la validación ficticia', () => {
    expect(() => validateFormulaReferences('ANCHO/0', ['ANCHO'])).toThrow(
      'No se puede dividir entre cero.'
    );
  });

  it('ignora una expresión vacía', () => {
    expect(() => validateFormulaReferences('', ['ANCHO'])).not.toThrow();
    expect(() => validateFormulaReferences(null, [])).not.toThrow();
  });
});

describe('resolveOtdVariables', () => {
  it('resuelve una cadena simple de variables calculadas', () => {
    const resolved = resolveOtdVariables([
      { code: 'A', expression: '2+3', data_type: 'NUMBER' },
      { code: 'B', expression: 'A*2', data_type: 'NUMBER' },
    ]);
    expect(resolved.A).toBe(5);
    expect(resolved.B).toBe(10);
  });

  it('combina las entradas de oficina (inputValues) con las variables calculadas', () => {
    const resolved = resolveOtdVariables(
      [{ code: 'SUPERFICIE', expression: 'ANCHO*ALTO', data_type: 'NUMBER' }],
      { ANCHO: 2000, ALTO: 1500 }
    );
    expect(resolved.ANCHO).toBe(2000);
    expect(resolved.ALTO).toBe(1500);
    expect(resolved.SUPERFICIE).toBe(3000000);
  });

  it('resuelve dependencias en cualquier orden de declaración', () => {
    // B se declara antes que A pero depende de A: debe resolverse igual.
    const resolved = resolveOtdVariables([
      { code: 'B', expression: 'A*2', data_type: 'NUMBER' },
      { code: 'A', expression: '10', data_type: 'NUMBER' },
    ]);
    expect(resolved.B).toBe(20);
  });

  it('detecta dependencias circulares', () => {
    expect(() =>
      resolveOtdVariables([
        { code: 'A', expression: 'B', data_type: 'NUMBER' },
        { code: 'B', expression: 'A', data_type: 'NUMBER' },
      ])
    ).toThrow(/Dependencia circular detectada/);
  });

  it('si una variable referenciada no existe en absoluto, falla (aunque con un mensaje engañoso: ver hallazgo reportado)', () => {
    // resolveOtdVariables() solo llama a resolve(dependency) cuando
    // definitions.has(dependency) ya es true (ver el bucle de dependencias
    // en formulaEngine.ts), así que la rama `if (!definition) throw
    // "No existe la variable..."` dentro de resolve() es en la práctica
    // inalcanzable: un código realmente inexistente nunca llega a activarla.
    // En su lugar, cae a evaluateFormula() con un contexto que no incluye
    // esa variable y produce este otro mensaje, menos claro para depurar un
    // typo en una fórmula de OTD.
    expect(() =>
      resolveOtdVariables([{ code: 'A', expression: 'B*2', data_type: 'NUMBER' }])
    ).toThrow("La variable 'B' no tiene un valor numérico.");
  });

  it('lanza un error si una variable referenciada no tiene expresión propia', () => {
    expect(() =>
      resolveOtdVariables([
        { code: 'A', expression: 'B*2', data_type: 'NUMBER' },
        { code: 'B', expression: null, data_type: 'NUMBER' },
      ])
    ).toThrow("La variable 'B' no tiene una expresión.");
  });

  it('ignora variables inactivas como si no existieran', () => {
    expect(() =>
      resolveOtdVariables([
        { code: 'A', expression: 'B*2', data_type: 'NUMBER', active: false },
        { code: 'B', expression: '5', data_type: 'NUMBER' },
      ])
    ).not.toThrow();
    // A está inactiva y no se resuelve como salida, aunque no dé error porque
    // solo se procesan expresiones de variables activas.
  });
});

describe('evaluateOtdComponent', () => {
  it('calcula cantidad y dimensiones a partir del contexto', () => {
    const result = evaluateOtdComponent(
      { code: 'LONA', quantity_expression: 'ANCHO*ALTO/1000000', dimension_expressions: { ancho_corte: 'ANCHO+50' } },
      { ANCHO: 2000, ALTO: 1500 }
    );
    expect(result.quantity).toBe(3);
    expect(result.dimensions.ancho_corte).toBe(2050);
  });

  it('usa "1" como fórmula de cantidad por defecto cuando no se especifica', () => {
    const result = evaluateOtdComponent(
      { code: 'MOTOR', quantity_expression: '', dimension_expressions: {} },
      {}
    );
    expect(result.quantity).toBe(1);
  });

  it('rechaza una cantidad negativa', () => {
    expect(() =>
      evaluateOtdComponent({ code: 'X', quantity_expression: '-1', dimension_expressions: {} }, {})
    ).toThrow("La cantidad del componente 'X' no puede ser negativa.");
  });

  it('rechaza una dimensión negativa', () => {
    expect(() =>
      evaluateOtdComponent(
        { code: 'X', quantity_expression: '1', dimension_expressions: { alto: 'ALTO-100' } },
        { ALTO: 50 }
      )
    ).toThrow("La dimensión 'alto' del componente 'X' no puede ser negativa.");
  });

  it('omite dimensiones con expresión vacía', () => {
    const result = evaluateOtdComponent(
      { code: 'X', quantity_expression: '1', dimension_expressions: { a: '', b: '  ' } },
      {}
    );
    expect(result.dimensions).toEqual({});
  });
});

describe('evaluateOtdConfiguration', () => {
  it('integra variables y componentes en un único resultado', () => {
    const result = evaluateOtdConfiguration(
      {
        variables: [{ code: 'SUPERFICIE', expression: 'ANCHO*ALTO/1000000', data_type: 'NUMBER' }],
        components: [
          { code: 'LONA', quantity_expression: 'SUPERFICIE', dimension_expressions: {} },
          { code: 'PERFIL', quantity_expression: 'CEIL(ANCHO/1500)', dimension_expressions: {} },
        ],
      },
      { ANCHO: 3000, ALTO: 2000 }
    );
    expect(result.variables.SUPERFICIE).toBe(6);
    expect(result.components).toEqual([
      { code: 'LONA', quantity: 6, dimensions: {} },
      { code: 'PERFIL', quantity: 2, dimensions: {} },
    ]);
  });
});
