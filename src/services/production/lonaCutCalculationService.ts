export type LonaCutType = 'Asimétrico' | 'Retal Maxi' | 'Retal Mini' | 'Degradee' | 'Screen' | 'Telón';

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

function panelPieces(count: number, width: number, length: number): LonaCutPiece[] {
  return Array.from({ length: Math.max(0, count) }, (_, index) => ({
    kind: 'PANEL', width, length, side: 'CENTER', label: `Paño ${index + 1}`,
  }));
}

/**
 * Reparto en paños fiel a Toldos (auxiliar NuevaLineaCorteDeLona.realizarOperacion): siempre
 * usa el ancho real del material elegido (nunca una pieza rotada) como incremento de paño, y
 * acumula contra `target` — la línea para Asimétrico/Retal Maxi/Retal Mini, la salida para
 * Screen (que reparte paños sobre la salida en vez de la línea; mismas fórmulas, ejes
 * intercambiados). `effectiveLength` es la medida del lado corto de cada paño.
 *
 * Cuando el resto calculado sobrepasa el ancho de material disponible, no cabe físicamente
 * tal cual: Toldos añade un paño entero más y recalcula un resto real, más pequeño. Ese paso
 * de corrección solo se aplica dentro de la rama en la que el acumulado supera `target` (la
 * rama de encaje exacto no lo necesita: por construcción su resto nunca excede el ancho).
 */
function legacyCut(input: LonaCutCalculationInput, effectiveWidth: number, effectiveLength: number, target: number): Omit<LonaCutCalculationResult, 'geometry'> {
  let accumulated = 0;
  let panels = 0;
  while (accumulated < target) {
    accumulated += effectiveWidth;
    panels += 1;
  }

  let remainder = 0;
  const pieces: LonaCutPiece[] = [];

  if (input.type === 'Asimétrico' || input.type === 'Screen') {
    if (accumulated > target) {
      panels -= 1;
      remainder = target - panels * effectiveWidth + 2 * input.hem + panels * input.overlap;
      if (remainder === effectiveWidth) {
        panels += 1;
        remainder = 0;
      } else if (effectiveWidth < remainder) {
        panels += 1;
        remainder = (remainder - effectiveWidth) + input.overlap;
      }
    } else {
      remainder = 2 * input.hem + panels * input.overlap;
    }
    pieces.push(...panelPieces(panels, effectiveWidth, effectiveLength));
    if (remainder > 0) pieces.push({ kind: 'REMAINDER', width: remainder, length: effectiveLength, side: 'RIGHT', label: 'Resto' });
  } else if (input.type === 'Retal Maxi') {
    let distributed: number;
    if (accumulated > target) {
      panels -= 2;
      distributed = target - panels * effectiveWidth + 2 * input.hem + (panels + 1) * input.overlap;
      remainder = distributed / 2;
      if (effectiveWidth === distributed) {
        panels += 1;
        remainder = 0;
      } else if (2 * effectiveWidth < distributed) {
        panels += 1;
        distributed = target - panels * effectiveWidth + 2 * input.hem + (panels + 1) * input.overlap;
        remainder = distributed / 2;
      }
    } else {
      panels -= 1;
      distributed = effectiveWidth + 2 * input.hem + (panels + 1) * input.overlap;
      remainder = distributed / 2;
    }
    if (remainder > 0) {
      pieces.push({ kind: 'REMAINDER', width: remainder, length: effectiveLength, side: 'LEFT', label: 'Retal izquierdo' });
      pieces.push(...panelPieces(panels, effectiveWidth, effectiveLength));
      pieces.push({ kind: 'REMAINDER', width: remainder, length: effectiveLength, side: 'RIGHT', label: 'Retal derecho' });
    } else pieces.push(...panelPieces(panels, effectiveWidth, effectiveLength));
  } else {
    let distributed: number;
    if (accumulated > target) {
      panels -= 1;
      distributed = target - panels * effectiveWidth + 2 * input.hem + (panels + 1) * input.overlap;
      remainder = distributed / 2;
      if (effectiveWidth === distributed) {
        panels += 1;
        remainder = 0;
      } else if (2 * effectiveWidth < distributed) {
        panels += 1;
        distributed = target - panels * effectiveWidth + 2 * input.hem + (panels + 1) * input.overlap;
        remainder = distributed / 2;
      }
    } else {
      distributed = 2 * input.hem + (panels + 1) * input.overlap;
      remainder = distributed / 2;
    }
    if (remainder > 0) {
      pieces.push({ kind: 'REMAINDER', width: remainder, length: effectiveLength, side: 'LEFT', label: 'Retal izquierdo' });
      pieces.push(...panelPieces(panels, effectiveWidth, effectiveLength));
      pieces.push({ kind: 'REMAINDER', width: remainder, length: effectiveLength, side: 'RIGHT', label: 'Retal derecho' });
    } else pieces.push(...panelPieces(panels, effectiveWidth, effectiveLength));
  }

  return {
    type: input.type,
    selectedWidth: effectiveWidth,
    fullPanels: Math.max(0, panels),
    leftRemainder: Math.max(0, remainder),
    hasRemainder: remainder > 0,
    automaticRemainderSelectionAllowed: input.type !== 'Degradee',
    status: 'CALCULATED',
    pieces,
  };
}

function resolveOrientation(input: LonaCutCalculationInput): { rotated: boolean; cutWidth: number; cutLength: number } | undefined {
  if (input.stockWidth == null || input.stockLength == null || input.output == null) return undefined;
  const normal = { rotated: false, cutWidth: input.line, cutLength: input.output };
  const rotated = { rotated: true, cutWidth: input.output, cutLength: input.line };
  if (input.rotated) return rotated.cutWidth <= input.stockWidth && rotated.cutLength <= input.stockLength ? rotated : undefined;
  if (normal.cutWidth <= input.stockWidth && normal.cutLength <= input.stockLength) return normal;
  return rotated.cutWidth <= input.stockWidth && rotated.cutLength <= input.stockLength ? rotated : undefined;
}

function buildGeometry(input: LonaCutCalculationInput, pieces: LonaCutPiece[], orientation: { rotated: boolean; cutWidth: number; cutLength: number }): LonaCutGeometry | undefined {
  if (input.stockWidth == null || input.stockLength == null) return undefined;
  const rectangles: LonaCutGeometryRectangle[] = [];
  const totalPanelLength = pieces.filter(p => p.kind === 'PANEL').reduce((sum, p) => sum + p.length, 0);
  const remainderPieces = pieces.filter(p => p.kind === 'REMAINDER');

  if (input.type === 'Retal Maxi' || input.type === 'Retal Mini') {
    const left = remainderPieces.find(p => p.side === 'LEFT');
    const right = remainderPieces.find(p => p.side === 'RIGHT');
    if (left) rectangles.push({ kind: 'REMAINDER', x: 0, y: 0, width: left.length, length: left.width, label: left.label });
    let x = left?.length ?? 0;
    for (const panel of pieces.filter(p => p.kind === 'PANEL')) {
      rectangles.push({ kind: 'PANEL', x, y: 0, width: panel.length, length: panel.width, label: panel.label });
      x += panel.length;
    }
    if (right) rectangles.push({ kind: 'REMAINDER', x, y: 0, width: right.length, length: right.width, label: right.label });
  } else {
    let x = 0;
    for (const panel of pieces.filter(p => p.kind === 'PANEL')) {
      rectangles.push({ kind: 'PANEL', x, y: 0, width: panel.length, length: panel.width, label: panel.label });
      x += panel.length;
    }
    const remainder = remainderPieces[0];
    if (remainder) rectangles.push({ kind: 'REMAINDER', x, y: 0, width: remainder.length, length: remainder.width, label: remainder.label });
  }

  // The roll area not consumed by the transverse cut is explicitly visible.
  const occupiedLength = Math.min(input.stockLength, Math.max(totalPanelLength, ...rectangles.map(r => r.x + r.width), 0));
  if (input.stockLength > occupiedLength) {
    rectangles.push({ kind: 'UNUSED', x: occupiedLength, y: 0, width: input.stockLength - occupiedLength, length: input.stockWidth, label: 'Bobina sin utilizar' });
  }
  if (input.stockWidth > orientation.cutWidth && occupiedLength > 0) {
    rectangles.push({ kind: 'UNUSED', x: 0, y: orientation.cutWidth, width: occupiedLength, length: input.stockWidth - orientation.cutWidth, label: 'Ancho sin utilizar' });
  }

  return { stockWidth: input.stockWidth, stockLength: input.stockLength, cutWidth: orientation.cutWidth, cutLength: orientation.cutLength, rotated: orientation.rotated, rectangles };
}

export function calculateLonaCut(input: LonaCutCalculationInput): LonaCutCalculationResult {
  if (input.selectedWidth <= 0 || input.line < 0) throw new Error('Las dimensiones de corte deben ser válidas.');

  // Telón no lleva cálculo automático en Toldos (su rama estaba vacía): se deja pendiente.
  if (input.type === 'Telón') {
    return { type: input.type, selectedWidth: input.selectedWidth, fullPanels: 0, leftRemainder: 0, hasRemainder: false, automaticRemainderSelectionAllowed: true, status: 'PENDING', pieces: [] };
  }

  // Degradee es el único tipo en el que la necesidad se trata como una pieza entera que puede
  // girar para encajar en el rollo — el resto de tipos siempre reparten en paños del ancho real
  // de material, nunca de una pieza rotada (así lo hacía Toldos: `anchoSeleccionado` se usa tal
  // cual, sin ningún concepto de rotación, en las cuatro reglas de reparto).
  if (input.type === 'Degradee') {
    const orientation = resolveOrientation(input);
    if (orientation && input.output != null) {
      const pieces = [{ kind: 'PANEL' as const, width: orientation.cutWidth, length: orientation.cutLength, side: 'CENTER' as const, label: 'Pieza degradé' }];
      return { type: input.type, selectedWidth: orientation.cutWidth, fullPanels: 1, leftRemainder: 0, hasRemainder: false, automaticRemainderSelectionAllowed: false, status: 'CALCULATED', pieces, geometry: buildGeometry(input, pieces, orientation) };
    }
    return { type: input.type, selectedWidth: input.selectedWidth, fullPanels: 1, leftRemainder: 0, hasRemainder: false, automaticRemainderSelectionAllowed: false, status: 'CALCULATED', pieces: [{ kind: 'PANEL', width: input.selectedWidth, length: input.line, side: 'CENTER', label: 'Pieza degradé' }] };
  }

  if (input.type === 'Screen') {
    // Screen reparte los paños sobre la salida en vez de la línea (mismo algoritmo que
    // Asimétrico con los ejes intercambiados) — verificado en el bytecode original, donde
    // "Screen" tenía cálculo completo y nunca estuvo realmente pendiente.
    if (input.output == null) {
      return { type: input.type, selectedWidth: input.selectedWidth, fullPanels: 0, leftRemainder: 0, hasRemainder: false, automaticRemainderSelectionAllowed: true, status: 'PENDING', pieces: [] };
    }
    return legacyCut(input, input.selectedWidth, input.line, input.output);
  }

  // Asimétrico / Retal Maxi / Retal Mini: paños del ancho real de material, longitud = salida.
  return legacyCut(input, input.selectedWidth, input.output ?? input.line, input.line);
}
