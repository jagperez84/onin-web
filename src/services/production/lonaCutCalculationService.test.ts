import { describe, it, expect } from 'vitest';
import { calculateLonaCut, type LonaCutCalculationInput } from './lonaCutCalculationService';
import { calculateLonaCutPresentation } from './lonaCutPresentationService';

function input(overrides: Partial<LonaCutCalculationInput> = {}): LonaCutCalculationInput {
  return {
    type: 'Asimétrico',
    line: 2000,
    selectedWidth: 1000,
    hem: 0,
    overlap: 0,
    ...overrides,
  };
}

describe('calculateLonaCut — validación de entrada', () => {
  it('rechaza un ancho de material seleccionado no positivo', () => {
    expect(() => calculateLonaCut(input({ selectedWidth: 0 }))).toThrow('Las dimensiones de corte deben ser válidas.');
    expect(() => calculateLonaCut(input({ selectedWidth: -100 }))).toThrow();
  });

  it('rechaza una línea negativa, pero permite línea 0', () => {
    expect(() => calculateLonaCut(input({ line: -1 }))).toThrow();
    expect(() => calculateLonaCut(input({ line: 0 }))).not.toThrow();
  });
});

describe('calculateLonaCut — Telón', () => {
  it('siempre devuelve estado PENDING sin piezas, sin cálculo automático en el legacy', () => {
    const result = calculateLonaCut(input({ type: 'Telón', line: 5000, selectedWidth: 1200 }));
    expect(result.status).toBe('PENDING');
    expect(result.pieces).toEqual([]);
    expect(result.fullPanels).toBe(0);
  });
});

describe('calculateLonaCut — Asimétrico', () => {
  it('encaje exacto (accumulated === target): resto = 2×vaina + paños×solape', () => {
    const result = calculateLonaCut(
      input({ type: 'Asimétrico', selectedWidth: 1000, output: 1500, line: 2000, hem: 10, overlap: 5 })
    );
    expect(result.fullPanels).toBe(2);
    expect(result.leftRemainder).toBe(30); // 2*10 + 2*5
    expect(result.hasRemainder).toBe(true);
    expect(result.pieces).toEqual([
      { kind: 'PANEL', width: 1000, length: 1500, side: 'CENTER', label: 'Paño 1' },
      { kind: 'PANEL', width: 1000, length: 1500, side: 'CENTER', label: 'Paño 2' },
      { kind: 'REMAINDER', width: 30, length: 1500, side: 'RIGHT', label: 'Resto' },
    ]);
  });

  it('sobrepasa el ancho disponible (caso simple, sin corrección adicional)', () => {
    const result = calculateLonaCut(input({ type: 'Asimétrico', selectedWidth: 1000, line: 2500, hem: 10, overlap: 5 }));
    // 3 paños acumulan 3000 > 2500 -> se descuenta 1 -> resto = 2500-2000+20+10 = 530
    expect(result.fullPanels).toBe(2);
    expect(result.leftRemainder).toBe(530);
    expect(result.hasRemainder).toBe(true);
  });

  it('cuando el resto calculado coincide exactamente con el ancho de material, se convierte en un paño entero más', () => {
    const result = calculateLonaCut(input({ type: 'Asimétrico', selectedWidth: 100, line: 190, hem: 5, overlap: 0, output: 300 }));
    expect(result.fullPanels).toBe(2);
    expect(result.leftRemainder).toBe(0);
    expect(result.hasRemainder).toBe(false);
    expect(result.pieces).toHaveLength(2);
    expect(result.pieces.every(p => p.kind === 'PANEL')).toBe(true);
  });

  it('cuando el resto calculado supera el ancho de material, añade un paño más y recalcula un resto real', () => {
    const result = calculateLonaCut(input({ type: 'Asimétrico', selectedWidth: 100, line: 195, hem: 5, overlap: 2 }));
    expect(result.fullPanels).toBe(2);
    expect(result.leftRemainder).toBe(9);
    expect(result.hasRemainder).toBe(true);
  });

  it('nunca produce fullPanels/leftRemainder negativos', () => {
    const result = calculateLonaCut(input({ type: 'Asimétrico', selectedWidth: 1000, line: 0, hem: 0, overlap: 0 }));
    expect(result.fullPanels).toBeGreaterThanOrEqual(0);
    expect(result.leftRemainder).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateLonaCut — Retal Maxi (resto repartido a ambos lados)', () => {
  it('encaje exacto: un paño menos que el conteo bruto, resto repartido en ambos lados', () => {
    const result = calculateLonaCut(input({ type: 'Retal Maxi', selectedWidth: 100, line: 200, hem: 0, overlap: 0 }));
    expect(result.fullPanels).toBe(1);
    expect(result.leftRemainder).toBe(50);
    expect(result.pieces).toEqual([
      { kind: 'REMAINDER', width: 50, length: 200, side: 'LEFT', label: 'Retal izquierdo' },
      { kind: 'PANEL', width: 100, length: 200, side: 'CENTER', label: 'Paño 1' },
      { kind: 'REMAINDER', width: 50, length: 200, side: 'RIGHT', label: 'Retal derecho' },
    ]);
  });

  it('sobrepasa el ancho disponible: se descuentan dos paños del conteo bruto', () => {
    const result = calculateLonaCut(input({ type: 'Retal Maxi', selectedWidth: 100, line: 250, hem: 0, overlap: 0 }));
    expect(result.fullPanels).toBe(1);
    expect(result.leftRemainder).toBe(75);
  });
});

describe('calculateLonaCut — Retal Mini (resto repartido, un paño menos)', () => {
  it('encaje exacto: no descuenta ningún paño del conteo bruto', () => {
    const result = calculateLonaCut(input({ type: 'Retal Mini', selectedWidth: 100, line: 200, hem: 10, overlap: 5 }));
    expect(result.fullPanels).toBe(2);
    expect(result.leftRemainder).toBe(17.5); // (2*10 + 3*5) / 2
    expect(result.pieces[0]).toMatchObject({ kind: 'REMAINDER', side: 'LEFT' });
    expect(result.pieces.at(-1)).toMatchObject({ kind: 'REMAINDER', side: 'RIGHT' });
  });

  it('sobrepasa el ancho disponible: se descuenta un paño del conteo bruto', () => {
    const result = calculateLonaCut(input({ type: 'Retal Mini', selectedWidth: 100, line: 250, hem: 0, overlap: 0 }));
    expect(result.fullPanels).toBe(2);
    expect(result.leftRemainder).toBe(25);
  });
});

describe('calculateLonaCut — Screen (reparte sobre la salida, no sobre la línea)', () => {
  it('sin salida (output) definida, queda pendiente', () => {
    const result = calculateLonaCut(input({ type: 'Screen', output: undefined }));
    expect(result.status).toBe('PENDING');
  });

  it('con salida definida, reparte paños sobre la salida y usa la línea como longitud de paño', () => {
    const result = calculateLonaCut(input({ type: 'Screen', selectedWidth: 100, line: 300, output: 200, hem: 0, overlap: 0 }));
    expect(result.status).toBe('CALCULATED');
    expect(result.fullPanels).toBe(2);
    expect(result.hasRemainder).toBe(false);
    expect(result.pieces).toEqual([
      { kind: 'PANEL', width: 100, length: 300, side: 'CENTER', label: 'Paño 1' },
      { kind: 'PANEL', width: 100, length: 300, side: 'CENTER', label: 'Paño 2' },
    ]);
  });
});

describe('calculateLonaCut — Degradee (pieza única, con orientación/geometría)', () => {
  it('sin datos de rollo (stockWidth/stockLength) disponibles, cae a una pieza simple sin geometría', () => {
    const result = calculateLonaCut(input({ type: 'Degradee', selectedWidth: 1200, line: 3000 }));
    expect(result.status).toBe('CALCULATED');
    expect(result.fullPanels).toBe(1);
    expect(result.hasRemainder).toBe(false);
    expect(result.automaticRemainderSelectionAllowed).toBe(false);
    expect(result.pieces).toEqual([{ kind: 'PANEL', width: 1200, length: 3000, side: 'CENTER', label: 'Pieza degradé' }]);
    expect(result.geometry).toBeUndefined();
  });

  it('con datos de rollo y la pieza cabe sin rotar, construye geometría con la orientación normal', () => {
    const result = calculateLonaCut(
      input({ type: 'Degradee', line: 2000, output: 1000, stockWidth: 3000, stockLength: 5000 })
    );
    expect(result.geometry?.rotated).toBe(false);
    expect(result.geometry?.cutWidth).toBe(2000); // line
    expect(result.geometry?.cutLength).toBe(1000); // output
    expect(result.selectedWidth).toBe(2000);
  });

  it('si no cabe en orientación normal pero sí rotada, usa la orientación rotada', () => {
    // line=2000 no cabe en stockWidth=1500, pero rotada (cutWidth=output=1000) sí.
    const result = calculateLonaCut(
      input({ type: 'Degradee', line: 2000, output: 1000, stockWidth: 1500, stockLength: 5000 })
    );
    expect(result.geometry?.rotated).toBe(true);
    expect(result.geometry?.cutWidth).toBe(1000);
    expect(result.geometry?.cutLength).toBe(2000);
  });

  it('si ninguna orientación cabe en el rollo, cae a la pieza simple sin geometría', () => {
    const result = calculateLonaCut(
      input({ type: 'Degradee', line: 5000, output: 5000, stockWidth: 1000, stockLength: 1000 })
    );
    expect(result.geometry).toBeUndefined();
    expect(result.pieces).toHaveLength(1);
  });
});

describe('calculateLonaCutPresentation', () => {
  it('cuando el cálculo está pendiente (Telón), muestra los mensajes de "sin regla de cálculo"', () => {
    const presentation = calculateLonaCutPresentation({ type: 'Telón', line: 1000, selectedWidth: 500, hem: 0, overlap: 0 });
    expect(presentation.title).toBe('Cálculo pendiente');
    expect(presentation.remainderDescription).toContain('no tiene una regla de cálculo');
    expect(presentation.panelDescription).toContain('No se muestra una propuesta productiva');
  });

  it('usa singular para 1 paño y plural para más de uno', () => {
    const one = calculateLonaCutPresentation({ type: 'Retal Maxi', line: 200, selectedWidth: 100, hem: 0, overlap: 0 });
    expect(one.title).toBe('1 paño entero');
    const two = calculateLonaCutPresentation({ type: 'Asimétrico', line: 2000, selectedWidth: 1000, hem: 10, overlap: 5 });
    expect(two.title).toBe('2 paños enteros');
  });

  it('describe el resto lateral cuando existe, y su ausencia cuando no', () => {
    const withRemainder = calculateLonaCutPresentation({ type: 'Retal Maxi', line: 200, selectedWidth: 100, hem: 0, overlap: 0 });
    expect(withRemainder.remainderDescription).toBe('Resto lateral previsto: 50');

    const withoutRemainder = calculateLonaCutPresentation({ type: 'Asimétrico', line: 200, selectedWidth: 100, hem: 0, overlap: 0 });
    expect(withoutRemainder.remainderDescription).toBe('Sin resto lateral previsto.');
  });
});
