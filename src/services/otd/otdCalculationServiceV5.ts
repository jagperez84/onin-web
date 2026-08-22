import * as V4 from './otdCalculationServiceV4';
import { resolveOtdVariables } from './formulaEngine';
import { resolveComponentCharacteristicExpression } from './otdCharacteristicResolution';

export * from './otdCalculationServiceV4';

/**
 * OTD runtime with explicit parent-variable -> component-characteristic resolution.
 * The existing V4 calculator remains the pricing engine; this layer only resolves
 * the characteristic value before calculation and restores the configured reference
 * in the result for audit/snapshot purposes.
 */
export function calculateOtdRuntime(
  data: V4.OtdRuntimeData,
  rawValues: Record<string, string | number | boolean | null>
): V4.OtdCalculationResult {
  const numericVariables: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawValues)) {
    const n = Number(value);
    if (Number.isFinite(n)) numericVariables[key] = n;
  }

  let resolvedVariables: Record<string, number> = numericVariables;
  try {
    resolvedVariables = resolveOtdVariables(data.variables, numericVariables);
  } catch {
    // V4 remains responsible for reporting formula errors.
  }

  const resolvedData: V4.OtdRuntimeData = {
    ...data,
    components: data.components.map(component => {
      if (!component.characteristic_expression?.trim()) return component;
      const resolved = resolveComponentCharacteristicExpression(
        component,
        data,
        rawValues,
        resolvedVariables
      );
      return resolved ? { ...component, characteristic_expression: resolved } : component;
    }),
  };

  const result = V4.calculateOtdRuntime(resolvedData, rawValues);

  // Keep the configured reference (e.g. COLOR_ESTRUCTURA) in the result while
  // retaining the resolved characteristic selected by the calculator.
  result.components = result.components.map((calculated, index) => ({
    ...calculated,
    characteristic_expression: data.components[index]?.characteristic_expression ?? calculated.characteristic_expression,
  }));

  return result;
}
