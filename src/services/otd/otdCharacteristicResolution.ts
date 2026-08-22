import type { OtdComponentDef, OtdRuntimeData } from './otdCalculationServiceV4';

/**
 * Resolves a component characteristic from a parent OTD input/variable.
 *
 * Example:
 *   parent input/variable: COLOR_ESTRUCTURA = BLANCO
 *   component characteristic expression: COLOR_ESTRUCTURA
 *   => component characteristic value: BLANCO
 */
export function resolveComponentCharacteristicExpression(
  component: Pick<OtdComponentDef, 'characteristic_expression'>,
  data: OtdRuntimeData,
  inputs: Record<string, string | number | boolean | null>,
  resolvedVariables: Record<string, number>
): string | null {
  const expression = component.characteristic_expression?.trim();
  if (!expression) return null;

  // First-class OTD variable/reference: COLOR_ESTRUCTURA -> BLANCO.
  const variableValue = resolvedVariables[expression];
  if (Number.isFinite(variableValue)) return String(variableValue);

  // Direct office input: COLOR_ESTRUCTURA -> BLANCO.
  const inputValue = inputs[expression];
  if (inputValue !== null && inputValue !== undefined && String(inputValue).trim() !== '') {
    return String(inputValue);
  }

  // Keep the literal as a final fallback for fixed/legacy configurations.
  return expression;
}

export function componentUsesInheritedCharacteristic(component: Pick<OtdComponentDef, 'characteristic_expression'>): boolean {
  return Boolean(component.characteristic_expression?.trim());
}
