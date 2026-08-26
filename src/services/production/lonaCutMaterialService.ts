import { calculateLonaCut, LonaCutCalculationInput, LonaCutCalculationResult } from './lonaCutCalculationService';

export interface LonaCutPlanInput extends LonaCutCalculationInput {
  requiredLength: number;
  stockWidths: number[];
}

export interface LonaCutPlan {
  calculation: LonaCutCalculationResult;
  selectedWidth: number;
  materialSource: 'STOCK' | 'REMAINDER' | 'NONE';
  status: 'READY' | 'PENDING' | 'NO_MATERIAL';
}

export function buildLonaCutPlan(input: LonaCutPlanInput): LonaCutPlan {
  const available = input.stockWidths
    .filter((width) => Number.isFinite(width) && width > 0)
    .filter((width) => width >= input.requiredLength)
    .sort((a, b) => a - b);

  if (available.length === 0) {
    return {
      calculation: calculateLonaCut({ ...input, selectedWidth: input.selectedWidth }),
      selectedWidth: input.selectedWidth,
      materialSource: 'NONE',
      status: 'NO_MATERIAL',
    };
  }

  const selectedWidth = available.find((width) => width === input.selectedWidth) ?? available[0];
  const calculation = calculateLonaCut({ ...input, selectedWidth });

  return {
    calculation,
    selectedWidth,
    materialSource: 'STOCK',
    status: calculation.status === 'PENDING' ? 'PENDING' : 'READY',
  };
}
