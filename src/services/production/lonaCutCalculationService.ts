export type LonaCutType = 'Asimétrico' | 'Retal Maxi' | 'Retal Mini' | 'Degradee' | 'Screen';

export interface LonaCutCalculationInput {
  type: LonaCutType;
  line: number;
  selectedWidth: number;
  hem: number;
  overlap: number;
}

export interface LonaCutCalculationResult {
  type: LonaCutType;
  selectedWidth: number;
  fullPanels: number;
  leftRemainder: number;
  hasRemainder: boolean;
  automaticRemainderSelectionAllowed: boolean;
  status: 'CALCULATED' | 'PENDING';
}

function calculatePanels(input: LonaCutCalculationInput): { accumulated: number; panels: number } {
  let accumulated = 0;
  let panels = 0;
  while (accumulated < input.line) {
    accumulated += input.selectedWidth;
    panels += 1;
  }
  return { accumulated, panels };
}

export function calculateLonaCut(input: LonaCutCalculationInput): LonaCutCalculationResult {
  if (input.selectedWidth <= 0 || input.line < 0) {
    throw new Error('Las dimensiones de corte deben ser válidas.');
  }

  if (input.type === 'Degradee') {
    return {
      type: input.type,
      selectedWidth: input.selectedWidth,
      fullPanels: 1,
      leftRemainder: 0,
      hasRemainder: false,
      automaticRemainderSelectionAllowed: false,
      status: 'CALCULATED',
    };
  }

  if (input.type === 'Screen') {
    return {
      type: input.type,
      selectedWidth: input.selectedWidth,
      fullPanels: 0,
      leftRemainder: 0,
      hasRemainder: false,
      automaticRemainderSelectionAllowed: false,
      status: 'PENDING',
    };
  }

  const { accumulated, panels: calculatedPanels } = calculatePanels(input);
  let panels = calculatedPanels;
  let remainder = 0;
  let hasRemainder = true;

  if (input.type === 'Asimétrico') {
    if (accumulated > input.line) {
      panels -= 1;
      remainder = input.line - panels * input.selectedWidth;
      remainder += 2 * input.hem + panels * input.overlap;
    } else {
      remainder = 2 * input.hem + panels * input.overlap;
    }

    if (remainder === input.selectedWidth) {
      panels += 1;
      remainder = 0;
      hasRemainder = false;
    }
  } else if (input.type === 'Retal Maxi') {
    let distributedRemainder: number;
    if (accumulated > input.line) {
      panels -= 2;
      distributedRemainder = input.line - panels * input.selectedWidth;
      distributedRemainder += 2 * input.hem + (panels + 1) * input.overlap;
    } else {
      panels -= 1;
      distributedRemainder = input.selectedWidth + 2 * input.hem + (panels + 1) * input.overlap;
    }
    remainder = distributedRemainder / 2;
    if (input.selectedWidth === distributedRemainder) {
      panels += 1;
      remainder = 0;
      hasRemainder = false;
    }
  } else if (input.type === 'Retal Mini') {
    let distributedRemainder: number;
    if (accumulated > input.line) {
      panels -= 1;
      distributedRemainder = input.line - panels * input.selectedWidth;
      distributedRemainder += 2 * input.hem + (panels + 1) * input.overlap;
    } else {
      distributedRemainder = 2 * input.hem + (panels + 1) * input.overlap;
    }
    remainder = distributedRemainder / 2;
    if (input.selectedWidth === distributedRemainder) {
      panels += 1;
      remainder = 0;
      hasRemainder = false;
    }
  }

  return {
    type: input.type,
    selectedWidth: input.selectedWidth,
    fullPanels: Math.max(0, panels),
    leftRemainder: Math.max(0, remainder),
    hasRemainder,
    automaticRemainderSelectionAllowed: true,
    status: 'CALCULATED',
  };
}
