export type LonaCutType = 'Asimétrico' | 'Retal Maxi' | 'Retal Mini' | 'Degradee' | 'Screen';

export interface LonaCutCalculationInput {
  type: LonaCutType;
  line: number;
  output?: number;
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
  kind: 'PANEL' | 'REMAINDER' | 'UNUSED';
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

function panelPieces(fullPanels: number, width: number, length = width, label = 'Paño'): LonaCutPiece[] {
  return Array.from({ length: Math.max(0, fullPanels) }, (_, index) => ({
    kind: 'PANEL', width, length, side: 'CENTER', label: `${label} ${index + 1}`,
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

function resolveOrientation(input: LonaCutCalculationInput): { rotated: boolean; cutWidth: number; cutLength: number } | undefined {
  if (input.stockWidth == null || input.stockLength == null || input.output == null) return undefined;
  const normal = { rotated: false, cutWidth: input.line, cutLength: input.output };
  const turned = { rotated: true, cutWidth: input.output, cutLength: input.line };
  if (input.rotated) return turned.cutWidth <= input.stockWidth && turned.cutLength <= input.stockLength ? turned : undefined;
  if (normal.cutWidth <= input.stockWidth && normal.cutLength <= input.stockLength) return normal;
  return turned.cutWidth <= input.stockWidth && turned.cutLength <= input.stockLength ? turned : undefined;
}

function buildGeometry(input: LonaCutCalculationInput, pieces: LonaCutPiece[], orientation: { rotated: boolean; cutWidth: number; cutLength: number }): LonaCutGeometry | undefined {
  if (input.stockWidth == null || input.stockLength == null) return undefined;
  const { stockWidth, stockLength } = input;
  const rectangles: LonaCutGeometryRectangle[] = [];
  let cursor = 0;
  const transverse = orientation.cutWidth;

  for (const piece of pieces) {
    if (piece.kind === 'PANEL') {
      const pieceLength = piece.length;
      if (cursor + pieceLength > stockLength) break;
      rectangles.push({ kind: 'PANEL', x: cursor, y: 0, width: pieceLength, length: transverse, label: piece.label });
      cursor += pieceLength;
    }
  }

  const remainderLength = Math.max(0, stockLength - cursor);
  if (remainderLength > 0) {
    rectangles.push({ kind: 'REMAINDER', x: cursor, y: 0, width: remainderLength, length: stockWidth, label: 'Resto longitudinal' });
  }
  if (stockWidth > transverse && cursor > 0) {
    rectangles.push({ kind: 'REMAINDER', x: 0, y: transverse, width: cursor, length: stockWidth - transverse, label: 'Resto lateral' });
  }

  return {
    stockWidth,
    stockLength,
    cutWidth: orientation.cutWidth,
    cutLength: orientation.cutLength,
    rotated: orientation.rotated,
    rectangles,
  };
}

function calculateWithOrientation(input: LonaCutCalculationInput, orientation: { rotated: boolean; cutWidth: number; cutLength: number }): LonaCutCalculationResult {
  // The legacy rules operate on the effective transverse width after orientation.
  const effective = { ...input, selectedWidth: orientation.cutWidth };
  const { accumulated, panels: calculatedPanels } = calculatePanels(effective);
  let panels = calculatedPanels;
  let remainder = 0;
  const pieces: LonaCutPiece[] = [];

  if (input.type === 'Asimétrico') {
    if (accumulated > effective.line) {
      panels -= 1;
      remainder = effective.line - panels * effective.selectedWidth + 2 * effective.hem + panels * effective.overlap;
    } else remainder = 2 * effective.hem + panels * effective.overlap;
    if (remainder === effective.selectedWidth) { panels += 1; remainder = 0; }
    pieces.push(...panelPieces(panels, effective.selectedWidth, orientation.cutLength));
    if (remainder > 0) pieces.push({ kind: 'REMAINDER', width: remainder, length: orientation.cutLength, side: 'RIGHT', label: 'Resto' });
  } else if (input.type === 'Retal Maxi') {
    let distributed: number;
    if (accumulated > effective.line) {
      panels -= 2;
      distributed = effective.line - panels * effective.selectedWidth + 2 * effective.hem + (panels + 1) * effective.overlap;
    } else {
      panels -= 1;
      distributed = effective.selectedWidth + 2 * effective.hem + (panels + 1) * effective.overlap;
    }
    remainder = distributed / 2;
    if (effective.selectedWidth === distributed) { panels += 1; remainder = 0; }
    if (remainder > 0) {
      pieces.push({ kind: 'REMAINDER', width: remainder, length: orientation.cutLength, side: 'LEFT', label: 'Retal izquierdo' });
      pieces.push(...panelPieces(panels, effective.selectedWidth, orientation.cutLength));
      pieces.push({ kind: 'REMAINDER', width: remainder, length: orientation.cutLength, side: 'RIGHT', label: 'Retal derecho' });
    } else pieces.push(...panelPieces(panels, effective.selectedWidth, orientation.cutLength));
  } else {
    let distributed: number;
    if (accumulated > effective.line) {
      panels -= 1;
      distributed = effective.line - panels * effective.selectedWidth + 2 * effective.hem + (panels + 1) * effective.overlap;
    } else distributed = 2 * effective.hem + (panels + 1) * effective.overlap;
    remainder = distributed / 2;
    if (effective.selectedWidth === distributed) { panels += 1; remainder = 0; }
    if (remainder > 0) {
      pieces.push({ kind: 'REMAINDER', width: remainder, length: orientation.cutLength, side: 'LEFT', label: 'Retal izquierdo' });
      pieces.push(...panelPieces(panels, effective.selectedWidth, orientation.cutLength));
      pieces.push({ kind: 'REMAINDER', width: remainder, length: orientation.cutLength, side: 'RIGHT', label: 'Retal derecho' });
    } else pieces.push(...panelPieces(panels, effective.selectedWidth, orientation.cutLength));
  }

  return result(input, panels, remainder, pieces, 'CALCULATED', buildGeometry(input, pieces, orientation));
}

export function calculateLonaCut(input: LonaCutCalculationInput): LonaCutCalculationResult {
  if (input.selectedWidth <= 0 || input.line < 0) throw new Error('Las dimensiones de corte deben ser válidas.');
  if (input.type === 'Screen') return result(input, 0, 0, [], 'PENDING');

  const orientation = input.type === 'Degradee'
    ? { rotated: Boolean(input.rotated), cutWidth: input.selectedWidth, cutLength: input.line }
    : resolveOrientation(input);

  if (orientation && input.output != null && input.stockWidth != null && input.stockLength != null) {
    if (input.type === 'Degradee') {
      return result(input, 1, 0, [{ kind: 'PANEL', width: orientation.cutWidth, length: orientation.cutLength, side: 'CENTER', label: 'Pieza degradé' }], 'CALCULATED', buildGeometry(input, [{ kind: 'PANEL', width: orientation.cutWidth, length: orientation.cutLength, side: 'CENTER', label: 'Pieza degradé' }], orientation));
    }
    return calculateWithOrientation(input, orientation);
  }

  if (input.type === 'Degradee') {
    return result(input, 1, 0, [{ kind: 'PANEL', width: input.selectedWidth, length: input.line, side: 'CENTER', label: 'Pieza degradé' }]);
  }

  const { accumulated, panels: calculatedPanels } = calculatePanels(input);
  let panels = calculatedPanels;
  let remainder = 0;
  const pieces: LonaCutPiece[] = [];
  if (input.type === 'Asimétrico') {
    if (accumulated > input.line) { panels -= 1; remainder = input.line - panels * input.selectedWidth + 2 * input.hem + panels * input.overlap; }
    else remainder = 2 * input.hem + panels * input.overlap;
    if (remainder === input.selectedWidth) { panels += 1; remainder = 0; }
    pieces.push(...panelPieces(panels, input.selectedWidth));
    if (remainder > 0) pieces.push({ kind: 'REMAINDER', width: remainder, length: input.selectedWidth, side: 'RIGHT', label: 'Resto' });
  } else if (input.type === 'Retal Maxi') {
    let distributed: number;
    if (accumulated > input.line) { panels -= 2; distributed = input.line - panels * input.selectedWidth + 2 * input.hem + (panels + 1) * input.overlap; }
    else { panels -= 1; distributed = input.selectedWidth + 2 * input.hem + (panels + 1) * input.overlap; }
    remainder = distributed / 2;
    if (input.selectedWidth === distributed) { panels += 1; remainder = 0; }
    if (remainder > 0) {
      pieces.push({ kind: 'REMAINDER', width: remainder, length: input.selectedWidth, side: 'LEFT', label: 'Retal izquierdo' });
      pieces.push(...panelPieces(panels, input.selectedWidth));
      pieces.push({ kind: 'REMAINDER', width: remainder, length: input.selectedWidth, side: 'RIGHT', label: 'Retal derecho' });
    } else pieces.push(...panelPieces(panels, input.selectedWidth));
  } else {
    let distributed: number;
    if (accumulated > input.line) { panels -= 1; distributed = input.line - panels * input.selectedWidth + 2 * input.hem + (panels + 1) * input.overlap; }
    else distributed = 2 * input.hem + (panels + 1) * input.overlap;
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
