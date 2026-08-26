export type LonaCutType = 'Asimétrico' | 'Retal Maxi' | 'Retal Mini' | 'Degradee' | 'Screen';

export interface LonaCutCalculationInput {
  type: LonaCutType;
  line: number;
  selectedWidth: number;
  hem: number;
  overlap: number;
}

export interface LonaCutPiece {
  kind: 'PANEL' | 'REMAINDER';
  width: number;
  length: number;
  side: 'LEFT' | 'CENTER' | 'RIGHT';
  label: string;
}

export interface LonaCutCalculationResult {
  type: LonaCutType;
  selectedWidth: number;
  fullPanels: number;
  leftRemainder: number;
  hasRemainder: boolean;
  automaticRemainderSelectionAllowed: boolean;
  status: 'CALCULATED' | 'PENDING';
  pieces: LonaCutPiece[];
}

function panelPieces(fullPanels: number, width: number, label = 'Paño'): LonaCutPiece[] {
  return Array.from({ length: Math.max(0, fullPanels) }, (_, index) => ({
    kind: 'PANEL', width, length: width, side: 'CENTER', label: `${label} ${index + 1}`,
  }));
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

function result(input: LonaCutCalculationInput, fullPanels: number, remainder: number, pieces: LonaCutPiece[], status: 'CALCULATED' | 'PENDING' = 'CALCULATED'): LonaCutCalculationResult {
  return {
    type: input.type,
    selectedWidth: input.selectedWidth,
    fullPanels: Math.max(0, fullPanels),
    leftRemainder: Math.max(0, remainder),
    hasRemainder: remainder > 0,
    automaticRemainderSelectionAllowed: input.type !== 'Degradee',
    status,
    pieces,
  };
}

export function calculateLonaCut(input: LonaCutCalculationInput): LonaCutCalculationResult {
  if (input.selectedWidth <= 0 || input.line < 0) throw new Error('Las dimensiones de corte deben ser válidas.');

  if (input.type === 'Degradee') {
    return result(input, 1, 0, [{ kind: 'PANEL', width: input.selectedWidth, length: input.line, side: 'CENTER', label: 'Pieza degradé' }]);
  }

  if (input.type === 'Screen') return result(input, 0, 0, [], 'PENDING');

  const { accumulated, panels: calculatedPanels } = calculatePanels(input);
  let panels = calculatedPanels;
  let remainder = 0;
  const pieces: LonaCutPiece[] = [];

  if (input.type === 'Asimétrico') {
    if (accumulated > input.line) {
      panels -= 1;
      remainder = input.line - panels * input.selectedWidth + 2 * input.hem + panels * input.overlap;
    } else remainder = 2 * input.hem + panels * input.overlap;
    if (remainder === input.selectedWidth) { panels += 1; remainder = 0; }
    pieces.push(...panelPieces(panels, input.selectedWidth));
    if (remainder > 0) pieces.push({ kind: 'REMAINDER', width: remainder, length: input.selectedWidth, side: 'RIGHT', label: 'Resto' });
  } else if (input.type === 'Retal Maxi') {
    let distributed: number;
    if (accumulated > input.line) {
      panels -= 2;
      distributed = input.line - panels * input.selectedWidth + 2 * input.hem + (panels + 1) * input.overlap;
    } else {
      panels -= 1;
      distributed = input.selectedWidth + 2 * input.hem + (panels + 1) * input.overlap;
    }
    remainder = distributed / 2;
    if (input.selectedWidth === distributed) { panels += 1; remainder = 0; }
    if (remainder > 0) {
      pieces.push({ kind: 'REMAINDER', width: remainder, length: input.selectedWidth, side: 'LEFT', label: 'Retal izquierdo' });
      pieces.push(...panelPieces(panels, input.selectedWidth));
      pieces.push({ kind: 'REMAINDER', width: remainder, length: input.selectedWidth, side: 'RIGHT', label: 'Retal derecho' });
    } else pieces.push(...panelPieces(panels, input.selectedWidth));
  } else {
    let distributed: number;
    if (accumulated > input.line) {
      panels -= 1;
      distributed = input.line - panels * input.selectedWidth + 2 * input.hem + (panels + 1) * input.overlap;
    } else distributed = 2 * input.hem + (panels + 1) * input.overlap;
    remainder = distributed / 2;
    if (input.selectedWidth === distributed) { panels += 1; remainder = 0; }
    if (remainder > 0) {
      pieces.push({ kind: 'REMAINDER', width: remainder, length: input.selectedWidth, side: 'LEFT', label: 'Retal izquierdo' });
      pieces.push(...panelPieces(panels, input.selectedWidth));
      pieces.push({ kind: 'REMAINDER', width: remainder, length: input.selectedWidth, side: 'RIGHT', label: 'Retal derecho' });
    } else pieces.push(...panelPieces(panels, input.selectedWidth));
  }

  return result(input, panels, remainder, pieces);
}
