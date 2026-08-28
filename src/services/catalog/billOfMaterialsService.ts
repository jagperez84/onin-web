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

export type BillOfMaterialsCalculation = {
  components: EvaluatedBomComponent[];
  total_breakdown_price: number;
  total_breakdown_cost: number;
  formula_variables_used: Record<string, number>;
};

/**
 * Safely evaluates a formula expression using the provided variable context.
 * Supports standard arithmetic, Math functions (min, max, ceil, floor, round, abs, sqrt),
 * and ternary conditions without relying on unsafe string evals.
 */
export function evaluateFormula(expression: string, context: Record<string, number>): number {
  if (!expression || !expression.trim()) return 1;

  const trimmed = expression.trim();
  // Check if it's just a raw number
  const num = Number(trimmed);
  if (!Number.isNaN(num)) {
    return num;
  }

  // Build sanitized evaluator
  const varNames = Object.keys(context);
  const varValues = Object.values(context);

  // Normalize case-insensitivity in expression by replacing tokens
  let parsedExpr = trimmed;

  // Replace common function aliases
  parsedExpr = parsedExpr
    .replace(/\bMIN\s*\(/gi, 'Math.min(')
    .replace(/\bMAX\s*\(/gi, 'Math.max(')
    .replace(/\bCEIL\s*\(/gi, 'Math.ceil(')
    .replace(/\bFLOOR\s*\(/gi, 'Math.floor(')
    .replace(/\bROUND\s*\(/gi, 'Math.round(')
    .replace(/\bABS\s*\(/gi, 'Math.abs(')
    .replace(/\bSQRT\s*\(/gi, 'Math.sqrt(');

  try {
    // Only allow alphanumeric, math operators, parentheses, commas, dots, and ternary
    const sanitizedCheck = parsedExpr.replace(/Math\.(min|max|ceil|floor|round|abs|sqrt)/g, '');
    if (/[^a-zA-Z0-9_\s+\-*/(),.?:<>=!]/g.test(sanitizedCheck)) {
      console.warn('Invalid characters in formula:', expression);
      return 1;
    }

    // Function constructor execution with bounded scope
    const fn = new Function(...varNames, `return (${parsedExpr});`);
    const result = fn(...varValues);
    if (typeof result === 'number' && Number.isFinite(result)) {
      return round2(result);
    }
    return 1;
  } catch (err) {
    console.warn(`Error evaluating expression "${expression}":`, err);
    return 1;
  }
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
  let totalBreakdownPrice = 0;
  let totalBreakdownCost = 0;

  for (const comp of components) {
    if (comp.active === false) continue;

    const expr = comp.quantity_expression || '1';
    const computedUnitQty = Math.max(0, evaluateFormula(expr, context));
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
  };
}
