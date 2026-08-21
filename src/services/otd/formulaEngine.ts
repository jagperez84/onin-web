export type OtdVariableDefinition = {
  code: string;
  expression: string | null;
  data_type: string;
  active?: boolean;
};

export type FormulaEvaluationContext = Record<string, number>;
export type FormulaEvaluationResult = { value: number; dependencies: string[] };

const BUILTIN_FUNCTIONS = new Set(['CEIL', 'FLOOR', 'ROUND', 'MAX', 'MIN', 'ABS', 'SQRT', 'TRUNC']);

export function evaluateFormula(
  expression: string | null | undefined,
  context: FormulaEvaluationContext
): FormulaEvaluationResult {
  const source = (expression ?? '').trim();
  if (!source) return { value: 0, dependencies: [] };

  let position = 0;
  const dependencies = new Set<string>();

  const skipSpaces = () => {
    while (position < source.length && /\s/.test(source[position])) {
      position += 1;
    }
  };

  const peek = () => {
    skipSpaces();
    return source[position];
  };

  const readNumber = (): number => {
    skipSpaces();
    const match = source.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) throw new Error(`Número no válido en posición ${position + 1}.`);
    position += match[0].length;
    return Number(match[0]);
  };

  const readIdentifier = (): string => {
    skipSpaces();
    const match = source.slice(position).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (!match) throw new Error(`Identificador no válido en posición ${position + 1}.`);
    position += match[0].length;
    return match[0];
  };

  const parseExpression = (): number => {
    let value = parseTerm();
    while (true) {
      skipSpaces();
      const operator = source[position];
      if (operator !== '+' && operator !== '-') break;
      position += 1;
      const right = parseTerm();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    while (true) {
      skipSpaces();
      const operator = source[position];
      if (operator !== '*' && operator !== '/' && operator !== '%') break;
      position += 1;
      const right = parseFactor();
      if ((operator === '/' || operator === '%') && right === 0) {
        throw new Error('No se puede dividir entre cero.');
      }
      value = operator === '*' ? value * right : operator === '/' ? value / right : value % right;
    }
    return value;
  };

  const parseFactor = (): number => {
    skipSpaces();
    const current = source[position];

    if (current === '+' || current === '-') {
      position += 1;
      const value = parseFactor();
      return current === '-' ? -value : value;
    }

    if (current === '(') {
      position += 1;
      const value = parseExpression();
      skipSpaces();
      if (source[position] !== ')') {
        throw new Error(`Falta ')' en posición ${position + 1}.`);
      }
      position += 1;
      return value;
    }

    if (/\d|\./.test(current ?? '')) {
      return readNumber();
    }

    const identifier = readIdentifier();
    const upperId = identifier.toUpperCase();

    // Check if it is a function call like CEIL(x), FLOOR(x), etc.
    if (peek() === '(') {
      position += 1; // skip '('
      const args: number[] = [];
      skipSpaces();
      if (source[position] !== ')') {
        while (true) {
          args.push(parseExpression());
          skipSpaces();
          if (source[position] === ',') {
            position += 1;
            continue;
          }
          if (source[position] === ')') {
            break;
          }
          throw new Error(`Se esperaba ',' o ')' en posición ${position + 1}.`);
        }
      }
      position += 1; // skip ')'

      switch (upperId) {
        case 'CEIL':
          if (args.length !== 1) throw new Error(`CEIL requiere exactamente 1 argumento.`);
          return Math.ceil(args[0]);
        case 'FLOOR':
          if (args.length !== 1) throw new Error(`FLOOR requiere exactamente 1 argumento.`);
          return Math.floor(args[0]);
        case 'ROUND':
          if (args.length === 1) return Math.round(args[0]);
          if (args.length === 2) {
            const factor = Math.pow(10, args[1]);
            return Math.round((args[0] + Number.EPSILON) * factor) / factor;
          }
          throw new Error(`ROUND requiere 1 o 2 argumentos.`);
        case 'TRUNC':
          if (args.length !== 1) throw new Error(`TRUNC requiere exactamente 1 argumento.`);
          return Math.trunc(args[0]);
        case 'MAX':
          if (args.length === 0) throw new Error(`MAX requiere al menos 1 argumento.`);
          return Math.max(...args);
        case 'MIN':
          if (args.length === 0) throw new Error(`MIN requiere al menos 1 argumento.`);
          return Math.min(...args);
        case 'ABS':
          if (args.length !== 1) throw new Error(`ABS requiere exactamente 1 argumento.`);
          return Math.abs(args[0]);
        case 'SQRT':
          if (args.length !== 1) throw new Error(`SQRT requiere exactamente 1 argumento.`);
          if (args[0] < 0) throw new Error(`No se puede calcular SQRT de un número negativo.`);
          return Math.sqrt(args[0]);
        default:
          throw new Error(`Función desconocida '${identifier}'.`);
      }
    }

    // It's a variable identifier
    const value = context[identifier];
    if (!Number.isFinite(value)) {
      throw new Error(`La variable '${identifier}' no tiene un valor numérico.`);
    }
    dependencies.add(identifier);
    return value;
  };

  const value = parseExpression();
  skipSpaces();
  if (position !== source.length) {
    throw new Error(`Carácter no permitido en posición ${position + 1}: '${source[position]}'.`);
  }
  if (!Number.isFinite(value)) {
    throw new Error('El resultado de la fórmula no es válido.');
  }

  return { value, dependencies: [...dependencies] };
}

export function extractVariableNames(expression: string | null | undefined): string[] {
  if (!expression) return [];
  const names = new Set<string>();
  for (const match of expression.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    const word = match[0];
    if (!BUILTIN_FUNCTIONS.has(word.toUpperCase())) {
      names.add(word);
    }
  }
  return [...names];
}

export function validateFormulaReferences(
  expression: string | null | undefined,
  knownVariables: Iterable<string>
): void {
  const known = new Set([...knownVariables].filter(Boolean));
  for (const name of extractVariableNames(expression)) {
    if (!known.has(name)) {
      throw new Error(`La fórmula utiliza la variable '${name}', pero no está definida en el OTD.`);
    }
  }
  if (expression?.trim()) {
    evaluateFormula(
      expression,
      Object.fromEntries([...known].map(name => [name, 1]))
    );
  }
}

export function resolveOtdVariables(
  variables: OtdVariableDefinition[],
  inputValues: FormulaEvaluationContext = {}
): FormulaEvaluationContext {
  const definitions = new Map(
    variables.filter(v => v.active !== false && v.code.trim()).map(v => [v.code.trim(), v])
  );
  const resolved = { ...inputValues };
  const resolving = new Set<string>();

  const resolve = (code: string): number => {
    if (Number.isFinite(resolved[code])) return resolved[code];
    const definition = definitions.get(code);
    if (!definition) throw new Error(`No existe la variable '${code}'.`);
    if (!definition.expression?.trim()) throw new Error(`La variable '${code}' no tiene una expresión.`);
    if (resolving.has(code)) throw new Error(`Dependencia circular detectada en la variable '${code}'.`);

    resolving.add(code);
    const localContext = { ...resolved };
    for (const dependency of extractVariableNames(definition.expression)) {
      if (dependency !== code && definitions.has(dependency)) {
        localContext[dependency] = resolve(dependency);
      }
    }
    const result = evaluateFormula(definition.expression, localContext);
    resolved[code] = result.value;
    resolving.delete(code);
    return result.value;
  };

  for (const variable of definitions.values()) {
    if (variable.expression?.trim()) {
      resolve(variable.code.trim());
    }
  }

  return resolved;
}

export type OtdComponentFormula = {
  code: string;
  quantity_expression: string | null;
  dimension_expressions: Record<string, string>;
  product_id?: number | null;
};

export type OtdComponentEvaluation = {
  quantity: number;
  dimensions: Record<string, number>;
};

export function evaluateOtdComponent(
  component: OtdComponentFormula,
  context: FormulaEvaluationContext
): OtdComponentEvaluation {
  const quantityResult = evaluateFormula(component.quantity_expression || '1', context);
  const quantity = quantityResult.value;
  if (quantity < 0) {
    throw new Error(`La cantidad del componente '${component.code}' no puede ser negativa.`);
  }

  const dimensions: Record<string, number> = {};
  for (const [dimensionCode, expression] of Object.entries(component.dimension_expressions ?? {})) {
    if (!expression || !expression.trim()) continue;
    const result = evaluateFormula(expression, context);
    if (result.value < 0) {
      throw new Error(
        `La dimensión '${dimensionCode}' del componente '${component.code}' no puede ser negativa.`
      );
    }
    dimensions[dimensionCode] = result.value;
  }

  return { quantity, dimensions };
}

export type OtdConfiguration = {
  variables: OtdVariableDefinition[];
  components: OtdComponentFormula[];
};

export type OtdConfigurationEvaluation = {
  variables: FormulaEvaluationContext;
  components: Array<OtdComponentEvaluation & { code: string }>;
};

export function evaluateOtdConfiguration(
  configuration: OtdConfiguration,
  inputValues: FormulaEvaluationContext = {}
): OtdConfigurationEvaluation {
  const variables = resolveOtdVariables(configuration.variables, inputValues);
  return {
    variables,
    components: configuration.components.map(component => ({
      code: component.code,
      ...evaluateOtdComponent(component, variables),
    })),
  };
}
