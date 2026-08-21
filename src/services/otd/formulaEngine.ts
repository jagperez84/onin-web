export type OtdVariableDefinition = {
  code: string;
  expression: string | null;
  data_type: string;
  active?: boolean;
};

export type FormulaEvaluationContext = Record<string, number>;

export type FormulaEvaluationResult = {
  value: number;
  dependencies: string[];
};

/**
 * Evaluates the small expression language used by OTD.
 *
 * Supported:
 * - numeric literals: 10, 10.5
 * - variable codes: ANCHO, ALTO_UTIL
 * - +, -, *, /
 * - unary + and -
 * - parentheses
 *
 * Deliberately does not use JavaScript eval/Function. This keeps formulas
 * deterministic and prevents arbitrary code execution when formulas are
 * stored in the database.
 */
export function evaluateFormula(
  expression: string | null | undefined,
  context: FormulaEvaluationContext,
): FormulaEvaluationResult {
  const source = (expression ?? '').trim();
  if (!source) {
    return { value: 0, dependencies: [] };
  }

  let position = 0;
  const dependencies = new Set<string>();

  const skipSpaces = () => {
    while (position < source.length && /\s/.test(source[position])) position += 1;
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
    if (!match) throw new Error(`Variable no válida en posición ${position + 1}.`);
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
      if (operator !== '*' && operator !== '/') break;
      position += 1;
      const right = parseFactor();
      if (operator === '/' && right === 0) throw new Error('No se puede dividir entre cero.');
      value = operator === '*' ? value * right : value / right;
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
      if (source[position] !== ')') throw new Error(`Falta ')' en posición ${position + 1}.`);
      position += 1;
      return value;
    }

    if (/\d|\./.test(current ?? '')) return readNumber();

    const identifier = readIdentifier();
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
    throw new Error(`Carácter no permitido en posición ${position + 1}.`);
  }
  if (!Number.isFinite(value)) throw new Error('El resultado de la fórmula no es válido.');

  return { value, dependencies: [...dependencies] };
}

/**
 * Resolves OTD variables, including variables that depend on other variables.
 * Variables are evaluated lazily and circular dependencies are rejected.
 */
export function resolveOtdVariables(
  variables: OtdVariableDefinition[],
  inputValues: FormulaEvaluationContext = {},
): FormulaEvaluationContext {
  const definitions = new Map(
    variables
      .filter(variable => variable.active !== false && variable.code.trim())
      .map(variable => [variable.code.trim(), variable]),
  );
  const resolved: FormulaEvaluationContext = { ...inputValues };
  const resolving = new Set<string>();

  const resolve = (code: string): number => {
    if (Number.isFinite(resolved[code])) return resolved[code];

    const definition = definitions.get(code);
    if (!definition) {
      throw new Error(`No existe la variable '${code}'.`);
    }
    if (!definition.expression?.trim()) {
      throw new Error(`La variable '${code}' no tiene una expresión.`);
    }
    if (resolving.has(code)) {
      throw new Error(`Dependencia circular detectada en la variable '${code}'.`);
    }

    resolving.add(code);
    const expression = definition.expression.trim();
    const dependencies = extractVariableNames(expression);
    const localContext: FormulaEvaluationContext = { ...resolved };
    for (const dependency of dependencies) {
      if (dependency !== code && definitions.has(dependency)) {
        localContext[dependency] = resolve(dependency);
      }
    }

    const result = evaluateFormula(expression, localContext);
    resolved[code] = result.value;
    resolving.delete(code);
    return result.value;
  };

  for (const variable of definitions.values()) {
    if (variable.expression?.trim()) resolve(variable.code.trim());
  }

  return resolved;
}

export function extractVariableNames(expression: string | null | undefined): string[] {
  if (!expression) return [];
  const names = new Set<string>();
  const matches = expression.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g);
  for (const match of matches) names.add(match[0]);
  return [...names];
}

export type OtdComponentFormula = {
  code: string;
  quantity_expression: string | null;
  dimension_expressions: Record<string, string>;
};

export type OtdComponentEvaluation = {
  quantity: number;
  dimensions: Record<string, number>;
};

export function evaluateOtdComponent(
  component: OtdComponentFormula,
  context: FormulaEvaluationContext,
): OtdComponentEvaluation {
  const quantity = evaluateFormula(component.quantity_expression || '1', context).value;
  if (quantity < 0) throw new Error(`La cantidad del componente '${component.code}' no puede ser negativa.`);

  const dimensions: Record<string, number> = {};
  for (const [dimensionCode, expression] of Object.entries(component.dimension_expressions ?? {})) {
    if (!expression.trim()) continue;
    const value = evaluateFormula(expression, context).value;
    if (value < 0) throw new Error(`La dimensión '${dimensionCode}' del componente '${component.code}' no puede ser negativa.`);
    dimensions[dimensionCode] = value;
  }

  return { quantity, dimensions };
}
