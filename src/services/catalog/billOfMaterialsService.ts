import { round2 } from './productPricingService';

export type BomComponentDefinition = {
  id: number;
  code: string;
  description: string | null;
  quantity_expression: string | null;
  unit_id: number | null;
  unit_code?: string | null;
  unit_name?: string | null;
  product_id: number | null;
  product_code?: string | null;
  product_name?: string | null;
  unit_price?: number;
  unit_cost?: number;
  add_pvp?: boolean;
  add_increment?: boolean;
  sort_order?: number;
  active?: boolean;
};

export type EvaluatedBomComponent = {
  id: number;
  code: string;
  description: string;
  quantity_expression: string;
  quantity: number;
  product_id: number | null;
  product_code: string | null;
  product_name: string | null;
  unit_id: number | null;
  unit_code: string;
  unit_price: number;
  unit_cost: number;
  total_price: number;
  total_cost: number;
  add_pvp: boolean;
  add_increment: boolean;
  evaluated_dimensions?: Array<{
    dimension_code: string;
    dimension_name: string;
    value: number;
    unit_code?: string;
  }>;
};

export type BomFormulaError = {
  component_id: number;
  component_code: string;
  component_description: string;
  expression: string;
  message: string;
};

export type BillOfMaterialsCalculation = {
  components: EvaluatedBomComponent[];
  total_breakdown_price: number;
  total_breakdown_cost: number;
  formula_variables_used: Record<string, number>;
  formula_errors: BomFormulaError[];
};

const BOM_FUNCTIONS = new Set(['MIN', 'MAX', 'CEIL', 'FLOOR', 'ROUND', 'ABS', 'SQRT']);

// Parser recursivo descendente propio: nunca construye ni ejecuta texto como
// código (nada de `new Function`/`eval`). Aritmética (+ - * /), comparaciones
// (< <= > >= == != === !==), condicional ternario (?:) y las funciones
// MIN/MAX/CEIL/FLOOR/ROUND/ABS/SQRT (alias insensibles a mayúsculas, como ya
// hacía la implementación anterior). Cualquier sintaxis fuera de esta
// gramática lanza un error de parseo capturado por evaluateFormula(), que
// conserva el mismo contrato externo que tenía antes (silenciosamente
// devuelve 1 ante cualquier fórmula vacía, inválida o no numérica).
function parseBomExpression(source: string, context: Record<string, number>): number | boolean {
  let position = 0;

  const skipSpaces = () => {
    while (position < source.length && /\s/.test(source[position])) position += 1;
  };
  const peek = () => {
    skipSpaces();
    return source[position];
  };
  const peekOp = (op: string) => source.startsWith(op, position);

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

  const parseTernary = (): number | boolean => {
    const condition = parseComparison();
    skipSpaces();
    if (source[position] !== '?') return condition;
    position += 1;
    const whenTrue = parseTernary();
    skipSpaces();
    if (source[position] !== ':') throw new Error(`Falta ':' en posición ${position + 1}.`);
    position += 1;
    const whenFalse = parseTernary();
    return condition ? whenTrue : whenFalse;
  };

  const parseComparison = (): number | boolean => {
    let value: number | boolean = parseAdditive();
    skipSpaces();
    const ops = ['===', '!==', '==', '!=', '<=', '>=', '<', '>'] as const;
    const op = ops.find(peekOp);
    if (op) {
      position += op.length;
      const right = parseAdditive();
      switch (op) {
        case '===': case '==': value = value === right; break;
        case '!==': case '!=': value = value !== right; break;
        case '<=': value = value <= right; break;
        case '>=': value = value >= right; break;
        case '<': value = value < right; break;
        case '>': value = value > right; break;
      }
    }
    return value;
  };

  const parseAdditive = (): number => {
    let value = parseMultiplicative();
    while (true) {
      skipSpaces();
      const operator = source[position];
      if (operator !== '+' && operator !== '-') break;
      position += 1;
      const right = parseMultiplicative();
      value = operator === '+' ? value + right : value - right;
    }
    return value;
  };

  const parseMultiplicative = (): number => {
    let value = parseUnary();
    while (true) {
      skipSpaces();
      const operator = source[position];
      if (operator !== '*' && operator !== '/') break;
      position += 1;
      const right = parseUnary();
      value = operator === '*' ? value * right : value / right;
    }
    return value;
  };

  const parseUnary = (): number => {
    skipSpaces();
    const current = source[position];
    if (current === '+' || current === '-') {
      position += 1;
      const value = parseUnary();
      return current === '-' ? -value : value;
    }
    if (current === '!') {
      position += 1;
      return parseUnary() ? 0 : 1;
    }
    return parsePrimary();
  };

  const parsePrimary = (): number => {
    skipSpaces();
    const current = source[position];

    if (current === '(') {
      position += 1;
      const value = parseTernary();
      skipSpaces();
      if (source[position] !== ')') throw new Error(`Falta ')' en posición ${position + 1}.`);
      position += 1;
      return Number(value);
    }
    if (/\d|\./.test(current ?? '')) return readNumber();

    const identifier = readIdentifier();
    const upperId = identifier.toUpperCase();

    if (peek() === '(') {
      position += 1;
      const args: number[] = [];
      skipSpaces();
      if (source[position] !== ')') {
        while (true) {
          args.push(Number(parseTernary()));
          skipSpaces();
          if (source[position] === ',') { position += 1; continue; }
          if (source[position] === ')') break;
          throw new Error(`Se esperaba ',' o ')' en posición ${position + 1}.`);
        }
      }
      position += 1;
      if (!BOM_FUNCTIONS.has(upperId)) throw new Error(`Función desconocida '${identifier}'.`);
      switch (upperId) {
        case 'MIN': return Math.min(...args);
        case 'MAX': return Math.max(...args);
        case 'CEIL': return Math.ceil(args[0]);
        case 'FLOOR': return Math.floor(args[0]);
        case 'ROUND': return Math.round(args[0]);
        case 'ABS': return Math.abs(args[0]);
        case 'SQRT': return Math.sqrt(args[0]);
      }
    }

    const value = context[identifier];
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new Error(`La variable '${identifier}' no está definida.`);
    }
    return value;
  };

  const result = parseTernary();
  skipSpaces();
  if (position !== source.length) {
    throw new Error(`Carácter no permitido en posición ${position + 1}: '${source[position]}'.`);
  }
  return result;
}

/**
 * Igual que evaluateFormula(), pero además informa si la expresión no era un
 * número/vacío legítimo y falló al evaluarse (variable no definida, sintaxis
 * inválida, división por cero...), para que el llamante pueda decidir avisar
 * en vez de consumir en silencio el valor de respaldo `1`.
 */
export function evaluateFormulaWithDiagnostics(
  expression: string,
  context: Record<string, number>,
): { value: number; error: string | null } {
  if (!expression || !expression.trim()) return { value: 1, error: null };

  const trimmed = expression.trim();
  // Check if it's just a raw number
  const num = Number(trimmed);
  if (!Number.isNaN(num)) {
    return { value: num, error: null };
  }

  try {
    const result = parseBomExpression(trimmed, context);
    if (typeof result === 'number' && Number.isFinite(result)) {
      return { value: round2(result), error: null };
    }
    return { value: 1, error: `La fórmula "${expression}" no produce un número válido.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Error evaluating expression "${expression}":`, err);
    return { value: 1, error: message };
  }
}

/**
 * Evalúa una expresión de fórmula con el contexto de variables dado.
 * Soporta aritmética estándar, funciones (min, max, ceil, floor, round, abs,
 * sqrt), comparaciones y condicionales ternarios — mediante un parser propio,
 * sin depender de `eval`/`new Function` en ningún punto.
 */
export function evaluateFormula(expression: string, context: Record<string, number>): number {
  return evaluateFormulaWithDiagnostics(expression, context).value;
}

/**
 * Evaluates the full Bill of Materials (Despiece) for a quotation line.
 */
export function calculateBillOfMaterials(input: {
  components: BomComponentDefinition[];
  dimensions: Record<string, number | null>;
  quantity: number;
  characteristicCode?: string | null;
  characteristicName?: string | null;
}): BillOfMaterialsCalculation {
  const { components, dimensions, quantity, characteristicCode, characteristicName } = input;

  // Build variable dictionary (both lower and upper case keys for robustness)
  const context: Record<string, number> = {
    CANTIDAD: quantity,
    QTY: quantity,
    QUANTITY: quantity,
    N: quantity,
  };

  const rawDimEntries = Object.entries(dimensions);
  rawDimEntries.forEach(([key, val], index) => {
    const safeVal = val != null && Number.isFinite(val) ? val : 0;
    const cleanKey = key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    context[cleanKey] = safeVal;
    context[`D${index + 1}`] = safeVal;
    context[`DIM${index + 1}`] = safeVal;
    context[`DIMENSION_${index + 1}`] = safeVal;
  });

  // Also define common domain dimension names if present
  if (context['ANCHO'] == null && rawDimEntries[0]) context['ANCHO'] = rawDimEntries[0][1] ?? 0;
  if (context['SALIDA'] == null && rawDimEntries[1]) context['SALIDA'] = rawDimEntries[1][1] ?? 0;
  if (context['ALTO'] == null && rawDimEntries[2]) context['ALTO'] = rawDimEntries[2][1] ?? 0;

  const evaluatedList: EvaluatedBomComponent[] = [];
  const formulaErrors: BomFormulaError[] = [];
  let totalBreakdownPrice = 0;
  let totalBreakdownCost = 0;

  for (const comp of components) {
    if (comp.active === false) continue;

    const expr = comp.quantity_expression || '1';
    const { value, error } = evaluateFormulaWithDiagnostics(expr, context);
    if (error) {
      formulaErrors.push({
        component_id: comp.id,
        component_code: comp.code || comp.product_code || `COMP-${comp.id}`,
        component_description: comp.description || comp.product_name || '',
        expression: expr,
        message: error,
      });
    }
    const computedUnitQty = Math.max(0, value);
    const totalQty = round2(computedUnitQty);

    const unitPrice = round2(Number(comp.unit_price ?? 0));
    const unitCost = round2(Number(comp.unit_cost ?? 0));
    const totalPrice = round2(totalQty * unitPrice);
    const totalCost = round2(totalQty * unitCost);

    if (comp.add_pvp) {
      totalBreakdownPrice += totalPrice;
    }
    totalBreakdownCost += totalCost;

    evaluatedList.push({
      id: comp.id,
      code: comp.code || comp.product_code || `COMP-${comp.id}`,
      description: comp.description || comp.product_name || `Componente ${comp.code}`,
      quantity_expression: expr,
      quantity: totalQty,
      product_id: comp.product_id ?? null,
      product_code: comp.product_code ?? null,
      product_name: comp.product_name ?? null,
      unit_id: comp.unit_id,
      unit_code: comp.unit_code || 'ud',
      unit_price: unitPrice,
      unit_cost: unitCost,
      total_price: totalPrice,
      total_cost: totalCost,
      add_pvp: Boolean(comp.add_pvp),
      add_increment: Boolean(comp.add_increment),
      evaluated_dimensions: rawDimEntries.map(([code, value]) => ({
        dimension_code: code,
        dimension_name: code,
        value: value ?? 0,
      })),
    });
  }

  return {
    components: evaluatedList,
    total_breakdown_price: round2(totalBreakdownPrice),
    total_breakdown_cost: round2(totalBreakdownCost),
    formula_variables_used: context,
    formula_errors: formulaErrors,
  };
}
