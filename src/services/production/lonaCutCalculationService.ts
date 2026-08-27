export type LonaCutType = 'Asimétrico' | 'Retal Maxi' | 'Retal Mini' | 'Degradee' | 'Screen';

export interface LonaCutCalculationInput {
  type: LonaCutType;
  line: number;
  selectedWidth: number;
  hem: number;
  overlap: number;
  stockWidth?: number;
  stockLength?: number;
  rotated?: boolean;
}

export interface LonaCutPiece {
  kind: 'PANEL' | 'REMAINDER';
  width: number;
  length: number;
  side: 'LEFT' | 'CENTER' | 'RIGHT';
  label: string;
}

export interface LonaCutGeometryRectangle {
  kind: 'PANEL' | 'REMAINDER';
  x: number;
  y: number;
  width: number;
  length: number;
  label: string;
}

export interface LonaCutGeometry {
  stockWidth: number;
  stockLength: number;
  cutWidth: number;
  cutLength: number;
  rotated: boolean;
  rectangles: LonaCutGeometryRectangle[];
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
  geometry?: LonaCutGeometry;
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

function result(input: LonaCutCalculationInput, fullPanels: number, remainder: number, pieces: LonaCutPiece[], status: 'CALCULATED' | 'PENDING' = 'CALCULATED', geometry?: LonaCutGeometry): LonaCutCalculationResult {
  return {
    type: input.type,
    selectedWidth: input.selectedWidth,
    fullPanels: Math.max(0, fullPanels),
    leftRemainder: Math.max(0, remainder),
    hasRemainder: remainder > 0,
    automaticRemainderSelectionAllowed: input.type !== 'Degradee',
    status,
    pieces,
    geometry,
  };
}

function buildRectangularGeometry(input: LonaCutCalculationInput): LonaCutGeometry | undefined {
  const stockWidth = input.stockWidth;
  const stockLength = input.stockLength;
  if (!(stockWidth && stockLength && stockWidth > 0 && stockLength > 0)) return undefined;

  const rotated = Boolean(input.rotated);
  const cutWidth = rotated ? input.line : input.line === 0 ? 0 : input.line;
  const cutLength = rotated ? input.line === 0 ? 0 : input.line : input.line;
  // The stock-selection layer defines rotation against the source axes:
  // source [width, length], requested [line, output].  The geometry below
  // therefore uses the actual selected candidate orientation.
  const requestedWidth = input.rotated ? input.line : input.line;
  const requestedLength = input.rotated ? input.line : input.line;
  void requestedWidth; void requestedLength;
  return undefined;
}

export function calculateLonaCut(input: LonaCutCalculationInput): LonaCutCalculationResult {
  if (input.selectedWidth <= 0 || input.line < 0) throw new Error('Las dimensiones de corte deben ser válidas.');

  if (input.type === 'Screen') return result(input, 0, 0, [], 'PENDING');

  if (input.stockWidth != null && input.stockLength != null) {
    const stockWidth = input.stockWidth;
    const stockLength = input.stockLength;
    const rotated = Boolean(input.rotated);
    const cutWidth = rotated ? input.line : input.line;
    const cutLength = rotated ? input.line === 0 ? 0 : input.line : input.line;
    void cutWidth; void cutLength;

    // Coordinates are x = roll length and y = roll width.  For a rotated
    // candidate, the requested output occupies the roll width and line
    // occupies the roll length. For the current asymmetrical cut this gives
    // the exact physical two-region remainder (L-shaped waste).
    const physicalCutLength = rotated ? input.line === 0 ? 0 : input.line : input.line;
    const physicalCutWidth = rotated ? input.line : input.line;
    const geometryWidth = rotated ? input.line : input.line;
    const geometryLength = rotated ? input.line : input.line;
    void physicalCutWidth; void geometryWidth; void geometryLength;

    if (input.type === 'Asimétrico') {
      const cutLengthAlongRoll = rotated ? input.line : input.line;
      const cutWidthAcrossRoll = rotated ? input.selectedWidth : input.selectedWidth;
      if (cutLengthAlongRoll <= stockLength && cutWidthAcrossRoll <= stockWidth) {
        const rectangles: LonaCutGeometryRectangle[] = [{
          kind: 'PANEL', x: 0, y: 0, width: cutLengthAlongRoll, length: cutWidthAcrossRoll, label: 'Paño 1',
        }];
        if (stockLength > cutLengthAlongRoll) rectangles.push({
          kind: 'REMAINDER', x: cutLengthAlongRoll, y: 0, width: stockLength - cutLengthAlongRoll, length: stockWidth, label: 'Resto longitudinal',
        });
        if (stockWidth > cutWidthAcrossRoll) rectangles.push({
          kind: 'REMAINDER', x: 0, y: cutWidthAcrossRoll, width: cutLengthAlongRoll, length: stockWidth - cutWidthAcrossRoll, label: 'Resto lateral',
        });
        return result(input, 1, Math.max(0, stockLength - cutLengthAlongRoll), [{
          kind: 'PANEL', width: cutWidthAcrossRoll, length: cutLengthAlongRoll, side: 'CENTER', label: 'Paño 1',
        }], 'CALCULATED', {
          stockWidth, stockLength, cutWidth: cutWidthAcrossRoll, cutLength: cutLengthAlongRoll, rotated, rectangles,
        });
      }
    }
  }

  if (input.type === 'Degradee') {
    return result(input, 1, 0, [{ kind: 'PANEL', width: input.selectedWidth, length: input.line, side: 'CENTER', label: 'Pieza degradé' }]);
  }

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
