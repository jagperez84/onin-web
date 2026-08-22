import * as V4 from './otdCalculationServiceV4';

export * from './otdCalculationServiceV4';

/**
 * OTD runtime without OPTION -> article resolution.
 * OPTION values are configuration inputs only; components resolve their article
 * exclusively from component.product_id.
 */
export function calculateOtdRuntime(
  data: V4.OtdRuntimeData,
  rawValues: Record<string, string | number | boolean | null>
): V4.OtdCalculationResult {
  const fixedArticleData: V4.OtdRuntimeData = {
    ...data,
    components: data.components.map(component => ({
      ...component,
      product_selection_code: null,
    })),
  };

  return V4.calculateOtdRuntime(fixedArticleData, rawValues);
}
