import { describe, it, expect } from 'vitest';
import { calculateCuts, type CutCalculationInput } from './cutCalculationService';
import type { EvaluatedBomComponent } from './billOfMaterialsService';

function bomComponent(overrides: Partial<EvaluatedBomComponent> = {}): EvaluatedBomComponent {
  return {
    id: 1,
    code: 'COMP',
    description: 'Componente',
    quantity_expression: '1',
    quantity: 1,
    product_id: null,
    product_code: null,
    product_name: null,
    unit_id: null,
    unit_code: 'ud',
    unit_price: 0,
    unit_cost: 0,
    total_price: 0,
    total_cost: 0,
    add_pvp: false,
    add_increment: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<CutCalculationInput> = {}): CutCalculationInput {
  return {
    productCode: 'TOLDO-01',
    productName: 'Toldo capota',
    dimensions: { ancho: 3000, salida: 2000 },
    quantity: 1,
    ...overrides,
  };
}

describe('calculateCuts — corte de lona', () => {
  it('no genera cortes cuando no hay dimensiones', () => {
    const result = calculateCuts(baseInput({ dimensions: {} }));
    expect(result.has_canvas_cuts).toBe(false);
    expect(result.has_profile_cuts).toBe(false);
  });

  it('normaliza dimensiones en mm (>50) a metros; valores ya pequeños se asumen en metros', () => {
    const mm = calculateCuts(baseInput({ dimensions: { ancho: 3000, salida: 2000 } }));
    const m = calculateCuts(baseInput({ dimensions: { ancho: 3, salida: 2 } }));
    expect(mm.canvas_cuts[0].nominal_width).toBe(3);
    expect(m.canvas_cuts[0].nominal_width).toBe(3);
  });

  it('añade márgenes de costura (40mm ancho, 250mm alto) al calcular el corte', () => {
    const result = calculateCuts(baseInput({ dimensions: { ancho: 3000, salida: 2000 } }));
    const cut = result.canvas_cuts[0];
    expect(cut.cut_width).toBe(3.04);
    expect(cut.cut_height).toBe(2.25);
  });

  it('calcula el número de paños necesarios según el ancho de rollo estándar (1.20 m)', () => {
    // cut_width = 3.04 m -> ceil(3.04 / 1.20) = 3 paños
    const result = calculateCuts(baseInput({ dimensions: { ancho: 3000, salida: 2000 }, quantity: 1 }));
    expect(result.canvas_cuts[0].cloth_strips_count).toBe(3);
  });

  it('multiplica los paños por la cantidad de artículos del pedido', () => {
    const result = calculateCuts(baseInput({ dimensions: { ancho: 1000, salida: 1000 }, quantity: 4 }));
    // cut_width = 1.04 -> ceil(1.04/1.20) = 1 paño por unidad
    expect(result.canvas_cuts[0].cloth_strips_count).toBe(4);
  });

  it('el área total de lona se multiplica por la cantidad', () => {
    const one = calculateCuts(baseInput({ dimensions: { ancho: 1000, salida: 1000 }, quantity: 1 }));
    const three = calculateCuts(baseInput({ dimensions: { ancho: 1000, salida: 1000 }, quantity: 3 }));
    expect(three.total_fabric_m2).toBe(Number((one.total_fabric_m2 * 3).toFixed(2)));
  });

  it('añade un faldón/bambalina solo si el despiece real del artículo lo incluye', () => {
    const withoutValance = calculateCuts(baseInput({ dimensions: { ancho: 3000, salida: 2000 } }));
    expect(withoutValance.canvas_cuts).toHaveLength(1);

    const withValance = calculateCuts(
      baseInput({
        dimensions: { ancho: 3000, salida: 2000 },
        bomComponents: [
          bomComponent({
            id: 9,
            code: 'FALDON-01',
            description: 'Faldón delantero',
            quantity: 0.6,
          }),
        ],
      })
    );
    expect(withValance.canvas_cuts).toHaveLength(2);
    expect(withValance.canvas_cuts[1].name).toContain('Faldón');
  });

  it('no añade faldón si el componente de despiece tiene cantidad 0', () => {
    const result = calculateCuts(
      baseInput({
        dimensions: { ancho: 3000, salida: 2000 },
        bomComponents: [bomComponent({ code: 'FALDON-01', description: 'Faldón', quantity: 0 })],
      })
    );
    expect(result.canvas_cuts).toHaveLength(1);
  });
});

describe('calculateCuts — corte de perfiles', () => {
  it('usa una estimación genérica (perfil de carga + tubo de enrolle) cuando no hay despiece configurado', () => {
    const result = calculateCuts(baseInput({ dimensions: { ancho: 3000, salida: 2000 } }));
    expect(result.profile_cuts.map(p => p.profile_code)).toEqual(['PRF-CARGA', 'TUB-ENROLLE']);
  });

  it('prioriza los componentes reales del despiece sobre la estimación genérica', () => {
    const result = calculateCuts(
      baseInput({
        dimensions: { ancho: 3000, salida: 2000 },
        quantity: 1,
        bomComponents: [
          bomComponent({ id: 5, code: 'PRF-BRAZO', description: 'Brazo articulado', unit_code: 'm', quantity: 2.94 }),
        ],
      })
    );
    expect(result.profile_cuts).toHaveLength(1);
    expect(result.profile_cuts[0].profile_code).toBe('PRF-BRAZO');
    // quantity (m) / pedido(1) * 1000 = longitud de corte en mm
    expect(result.profile_cuts[0].cut_length).toBe(2940);
  });

  it('reconoce componentes de perfil por código (PRF.../PERFIL...) aunque su unidad no sea "m"/"ml"', () => {
    const result = calculateCuts(
      baseInput({
        dimensions: { ancho: 3000, salida: 2000 },
        bomComponents: [bomComponent({ code: 'PERFIL-GUIA', unit_code: 'ud', quantity: 3 })],
      })
    );
    expect(result.profile_cuts.some(p => p.profile_code === 'PERFIL-GUIA')).toBe(true);
  });

  it('calcula las barras necesarias en función de la longitud estándar de barra (6000mm)', () => {
    const result = calculateCuts(
      baseInput({
        dimensions: { ancho: 3000, salida: 2000 },
        quantity: 3,
        bomComponents: [bomComponent({ code: 'PRF-X', unit_code: 'm', quantity: 3 * 5.99 })],
      })
    );
    // corte 5990mm, con margen de sierra 2mm -> 5992mm por pieza; solo cabe 1 por barra de 6000mm
    expect(result.profile_cuts[0].bars_required).toBe(3);
  });

  it('el margen de corte fino (smooth_cut) es mayor que el estándar', () => {
    const standard = calculateCuts(
      baseInput({
        dimensions: { ancho: 3000, salida: 2000 },
        quantity: 1,
        bomComponents: [bomComponent({ code: 'PRF-X', unit_code: 'm', quantity: 3 })],
      })
    );
    const smooth = calculateCuts(
      baseInput({
        dimensions: { ancho: 3000, salida: 2000 },
        quantity: 1,
        productCutSettings: { smooth_cut: true },
        bomComponents: [bomComponent({ code: 'PRF-X', unit_code: 'm', quantity: 3 })],
      })
    );
    expect(standard.profile_cuts[0].smooth_cut_applied).toBe(false);
    expect(smooth.profile_cuts[0].smooth_cut_applied).toBe(true);
  });

  it('marca un retal como reutilizable solo si supera el remanente mínimo configurado', () => {
    const result = calculateCuts(
      baseInput({
        dimensions: { ancho: 3000, salida: 2000 },
        quantity: 1,
        productCutSettings: { minimum_remainder: 100000 }, // umbral absurdamente alto -> nunca reutilizable
        bomComponents: [bomComponent({ code: 'PRF-X', unit_code: 'm', quantity: 1 })],
      })
    );
    expect(result.profile_cuts[0].is_reusable_remainder).toBe(false);
  });

  it('ignora un componente de despiece con cantidad efectiva de corte 0 o negativa', () => {
    const result = calculateCuts(
      baseInput({
        dimensions: { ancho: 3000, salida: 2000 },
        quantity: 1,
        bomComponents: [bomComponent({ code: 'PRF-X', unit_code: 'm', quantity: 0 })],
      })
    );
    expect(result.profile_cuts).toHaveLength(0);
  });
});

describe('calculateCuts — resumen de desperdicio', () => {
  it('total_scrap_percentage es 0 cuando no hay cortes de perfil', () => {
    const result = calculateCuts(baseInput({ dimensions: {} }));
    expect(result.total_scrap_percentage).toBe(0);
  });

  it('total_profile_bars suma las barras de todos los perfiles', () => {
    const result = calculateCuts(
      baseInput({
        dimensions: { ancho: 3000, salida: 2000 },
        quantity: 1,
        bomComponents: [
          bomComponent({ id: 1, code: 'PRF-A', unit_code: 'm', quantity: 1 }),
          bomComponent({ id: 2, code: 'PRF-B', unit_code: 'm', quantity: 1 }),
        ],
      })
    );
    expect(result.total_profile_bars).toBe(2);
  });
});
