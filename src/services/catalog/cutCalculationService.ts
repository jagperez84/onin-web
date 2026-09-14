import { round2 } from './productPricingService';
import type { EvaluatedBomComponent } from './billOfMaterialsService';
import type { FallbackProfileEstimate } from './productRepository';

export type CanvasCutPiece = {
  id: string;
  name: string;
  fabric_code?: string;
  fabric_color?: string;
  nominal_width: number; // m
  nominal_height: number; // m
  seam_allowance_width: number; // m (márgenes laterales)
  seam_allowance_height: number; // m (vainas / enrolle)
  cut_width: number; // m
  cut_height: number; // m
  cloth_strips_count: number; // paños
  roll_width_used: number; // m (ancho de rollo estándar)
  total_area_m2: number;
  confection_notes: string;
};

export type ProfileCutItem = {
  id: string;
  profile_code: string;
  profile_name: string;
  color?: string;
  cut_length: number; // mm or m
  unit: 'mm' | 'm';
  quantity_pieces: number;
  standard_bar_length: number; // 6000 mm
  bars_required: number;
  waste_scrap_total: number;
  scrap_remainder: number;
  is_reusable_remainder: boolean;
  smooth_cut_applied: boolean;
  notes: string;
};

export type CutCalculationResult = {
  has_canvas_cuts: boolean;
  has_profile_cuts: boolean;
  canvas_cuts: CanvasCutPiece[];
  profile_cuts: ProfileCutItem[];
  total_fabric_m2: number;
  total_profile_bars: number;
  total_scrap_percentage: number;
};

// Valores históricos (toldo enrollable), usados cuando la línea de comportamiento
// del artículo no define los suyos propios — así ningún artículo existente cambia
// de comportamiento con esta generalización.
const DEFAULT_ROLL_WIDTH_M = 1.2;
const DEFAULT_SEAM_ALLOWANCE_WIDTH_M = 0.04;
const DEFAULT_SEAM_ALLOWANCE_HEIGHT_M = 0.25;
const DEFAULT_STANDARD_BAR_LENGTH_MM = 6000;
const DEFAULT_FALLBACK_PROFILE_ESTIMATES: FallbackProfileEstimate[] = [
  { code: 'PRF-CARGA', name: 'Perfil Frontal de Carga / Terminal (estimado)', end_deduction_mm: 60, color: 'Aluminio estándar' },
  { code: 'TUB-ENROLLE', name: 'Tubo de Enrolle Ranurado (estimado)', end_deduction_mm: 75, color: 'Galvanizado' },
];

// Nombres de dimensión habituales en el sector: la primera dimensión suele ser el
// ancho de la pieza y la segunda su salida/alto/largo. Se resuelven por nombre
// cuando es posible (más fiable que el orden del objeto) y solo se recurre a la
// posición cuando el código de la dimensión no es reconocible (p. ej. DIMENSION_1).
const WIDTH_DIMENSION_PATTERN = /ancho|width/i;
const HEIGHT_DIMENSION_PATTERN = /alto|salida|largo|height|drop|ca[ií]da/i;

// Un componente de despiece se trata como una pieza de tejido propia (con su
// propio corte) si su unidad es superficie, o su código/descripción lo delatan —
// generaliza el caso, antes exclusivo, del faldón/bambalina de un toldo: ahora
// cualquier línea de producto (pérgola con pantalla, funda con refuerzo…) puede
// definir varias piezas de tejido en su despiece y cada una sale como su propio
// corte.
const FABRIC_COMPONENT_PATTERN = /fald[oó]n|bambalina|valance|^lona|^tejido|^tela/i;

function resolveWidthHeight(dimEntries: [string, number][]): { width: number; height: number } {
  const widthEntry = dimEntries.find(([key]) => WIDTH_DIMENSION_PATTERN.test(key));
  const heightEntry = dimEntries.find(
    ([key]) => key !== widthEntry?.[0] && HEIGHT_DIMENSION_PATTERN.test(key)
  );
  const remaining = dimEntries.filter(([key]) => key !== widthEntry?.[0] && key !== heightEntry?.[0]);
  const finalWidth = widthEntry ?? remaining.shift();
  const finalHeight = heightEntry ?? remaining.shift();
  return { width: finalWidth?.[1] ?? 0, height: finalHeight?.[1] ?? 0 };
}

function unitToMeters(unit?: string): number {
  const key = (unit || '').trim().toLowerCase();
  if (key === 'mm') return 0.001;
  if (key === 'cm') return 0.01;
  return 1; // m o desconocida: se asume metros
}

export type CutCalculationInput = {
  productCode: string;
  productName: string;
  dimensions: Record<string, number | null>;
  quantity: number;
  lineBehavior?: {
    roll_width_m?: number | null;
    seam_allowance_width_m?: number | null;
    seam_allowance_height_m?: number | null;
    standard_bar_length_mm?: number | null;
    fallback_profile_estimates?: FallbackProfileEstimate[] | null;
  } | null;
  family?: {
    confectionable?: boolean;
    recuttable?: boolean;
    minimum_remainder?: number | null;
  } | null;
  productCutSettings?: {
    minimum_remainder?: number | null;
    discarded_size?: number | null;
    smooth_cut?: boolean;
  };
  characteristicColor?: string | null;
  bomComponents?: EvaluatedBomComponent[];
};

export function calculateCuts(input: CutCalculationInput): CutCalculationResult {
  const {
    dimensions,
    quantity = 1,
    lineBehavior,
    family,
    productCutSettings,
    characteristicColor,
    bomComponents = [],
  } = input;

  const rollWidth = lineBehavior?.roll_width_m ?? DEFAULT_ROLL_WIDTH_M;
  const seamWidth = lineBehavior?.seam_allowance_width_m ?? DEFAULT_SEAM_ALLOWANCE_WIDTH_M;
  const seamHeight = lineBehavior?.seam_allowance_height_m ?? DEFAULT_SEAM_ALLOWANCE_HEIGHT_M;
  const stdBarMm = lineBehavior?.standard_bar_length_mm ?? DEFAULT_STANDARD_BAR_LENGTH_MM;
  const fallbackProfileEstimates = lineBehavior?.fallback_profile_estimates ?? DEFAULT_FALLBACK_PROFILE_ESTIMATES;

  const dimEntries = Object.entries(dimensions).filter(
    (entry): entry is [string, number] => entry[1] != null && Number.isFinite(entry[1])
  );
  const { width: rawW, height: rawH } = resolveWidthHeight(dimEntries);

  // Normalize to meters: if > 50, likely in mm or cm, convert to meters
  const widthMeters = rawW > 50 ? rawW / 1000 : rawW;
  const heightMeters = rawH > 50 ? rawH / 1000 : rawH;
  const widthMm = Math.round(widthMeters * 1000);
  const heightMm = Math.round(heightMeters * 1000);

  const canvasCuts: CanvasCutPiece[] = [];
  const profileCuts: ProfileCutItem[] = [];

  // Confeccionable/recortable son de la familia únicamente — antes el comportamiento de
  // línea tenía sus propios canvas_cut_enabled/cut_calculation_enabled/length_enabled que
  // activaban lo mismo en paralelo (dos interruptores para un mismo resultado, sin que
  // ninguno mandara sobre el otro). Se retiraron: la familia es la única fuente.
  const shouldCalculateCanvas =
    Boolean(family?.confectionable) ||
    widthMeters > 0 && heightMeters > 0;

  const shouldCalculateProfiles =
    Boolean(family?.recuttable) ||
    widthMeters > 0;

  // 1. Canvas / Fabric Cuts
  if (shouldCalculateCanvas && widthMeters > 0) {
    const cutW = round2(widthMeters + seamWidth);
    const cutH = round2((heightMeters || 1) + seamHeight);
    const strips = Math.max(1, Math.ceil(cutW / rollWidth));
    const totalArea = round2(cutW * cutH * quantity);

    canvasCuts.push({
      id: 'canvas-main-1',
      name: `Lona / Tejido principal (${strips} paños de ${rollWidth} m)`,
      fabric_code: 'LONA-STD',
      fabric_color: characteristicColor || 'Estándar',
      nominal_width: widthMeters,
      nominal_height: heightMeters,
      seam_allowance_width: seamWidth,
      seam_allowance_height: seamHeight,
      cut_width: cutW,
      cut_height: cutH,
      cloth_strips_count: strips * quantity,
      roll_width_used: rollWidth,
      total_area_m2: totalArea,
      confection_notes: `Vainas +${Math.round(seamHeight * 1000)} mm · Dobladillos +${Math.round(seamWidth * 1000)} mm · ${strips} paños unidos`,
    });

    // Piezas de tejido adicionales del despiece del artículo (faldón/bambalina de un
    // toldo, pantalla de una pérgola, refuerzo de una funda…): cada componente de
    // tejido que el despiece realmente lleve sale como su propio corte, usando sus
    // propias dimensiones si las tiene, o la estimación por cantidad si no.
    const fabricComponents = bomComponents.filter(
      comp => comp.quantity > 0 && (comp.unit_code === 'm2' || FABRIC_COMPONENT_PATTERN.test(`${comp.code} ${comp.description}`))
    );

    for (const comp of fabricComponents) {
      const ownWidthDim = comp.evaluated_dimensions?.find(d => WIDTH_DIMENSION_PATTERN.test(`${d.dimension_code} ${d.dimension_name}`));
      const ownHeightDim = comp.evaluated_dimensions?.find(d => HEIGHT_DIMENSION_PATTERN.test(`${d.dimension_code} ${d.dimension_name}`));

      const pieceWidth = ownWidthDim ? ownWidthDim.value * unitToMeters(ownWidthDim.unit_code) : widthMeters;
      const pieceHeight = ownHeightDim
        ? ownHeightDim.value * unitToMeters(ownHeightDim.unit_code)
        : widthMeters > 0
          ? round2(comp.quantity / (widthMeters * quantity))
          : null;

      if (pieceHeight && pieceHeight > 0) {
        canvasCuts.push({
          id: `canvas-extra-${comp.id}`,
          name: comp.description || 'Pieza de tejido adicional',
          fabric_code: comp.code,
          fabric_color: characteristicColor || 'Estándar',
          nominal_width: pieceWidth,
          nominal_height: pieceHeight,
          seam_allowance_width: seamWidth,
          seam_allowance_height: 0.05,
          cut_width: round2(pieceWidth + seamWidth),
          cut_height: round2(pieceHeight + 0.05),
          cloth_strips_count: Math.max(1, Math.ceil((pieceWidth + seamWidth) / rollWidth)) * quantity,
          roll_width_used: rollWidth,
          total_area_m2: round2((pieceWidth + seamWidth) * (pieceHeight + 0.05) * quantity),
          confection_notes: 'Corte con onda estándar y ribete a juego (según despiece del artículo)',
        });
      }
    }
  }

  // 2. Profile Cuts
  if (shouldCalculateProfiles && widthMm > 0) {
    const minRemainder = productCutSettings?.minimum_remainder ?? family?.minimum_remainder ?? 500; // 500mm
    const smoothCutMargin = productCutSettings?.smooth_cut ? 4 : 2; // mm blade kerf

    // The despiece (BOM) evaluated for this exact article is the source of truth for which
    // profiles it actually carries. Prefer it over any generic estimate.
    const bomProfileComponents = bomComponents.filter(
      comp =>
        comp.unit_code === 'm' ||
        comp.unit_code === 'ml' ||
        comp.code.startsWith('PRF') ||
        comp.code.startsWith('PERFIL')
    );

    if (bomProfileComponents.length > 0) {
      for (const comp of bomProfileComponents) {
        const compCutLengthMm = Math.round((comp.quantity / quantity) * 1000);
        if (compCutLengthMm <= 0) continue;
        const piecesPerBar = Math.floor(stdBarMm / (compCutLengthMm + smoothCutMargin)) || 1;
        const barsReq = Math.ceil(quantity / piecesPerBar);
        const scrapMm = (barsReq * stdBarMm) - (quantity * (compCutLengthMm + smoothCutMargin));

        profileCuts.push({
          id: `prof-bom-${comp.id}`,
          profile_code: comp.code,
          profile_name: comp.description,
          color: characteristicColor || 'Estándar',
          cut_length: compCutLengthMm,
          unit: 'mm',
          quantity_pieces: quantity,
          standard_bar_length: stdBarMm,
          bars_required: barsReq,
          waste_scrap_total: Math.max(0, scrapMm),
          scrap_remainder: Math.max(0, scrapMm % stdBarMm),
          is_reusable_remainder: scrapMm >= minRemainder,
          smooth_cut_applied: Boolean(productCutSettings?.smooth_cut),
          notes: `Componente de despiece con longitud unitaria de ${comp.quantity} m`,
        });
      }
    } else {
      // No despiece configured for this article yet: show an approximate technical estimate
      // instead of leaving the quote without a cut preview. Which profiles to guess (if any)
      // comes from la línea de comportamiento del artículo — por defecto, la estimación
      // histórica de toldo enrollable (perfil de carga + tubo). Una línea de comportamiento
      // que no sea un toldo enrollable puede fijar su propia lista, o [] para no estimar nada.
      for (const estimate of fallbackProfileEstimates) {
        const cutLength = Math.max(10, widthMm - estimate.end_deduction_mm);
        const piecesPerBar = Math.floor(stdBarMm / (cutLength + smoothCutMargin)) || 1;
        const barsReq = Math.ceil(quantity / piecesPerBar);
        const scrapMm = (barsReq * stdBarMm) - (quantity * (cutLength + smoothCutMargin));

        profileCuts.push({
          id: `prof-estimate-${estimate.code}`,
          profile_code: estimate.code,
          profile_name: estimate.name,
          color: estimate.color,
          cut_length: cutLength,
          unit: 'mm',
          quantity_pieces: quantity,
          standard_bar_length: stdBarMm,
          bars_required: barsReq,
          waste_scrap_total: Math.max(0, scrapMm),
          scrap_remainder: Math.max(0, scrapMm % stdBarMm),
          is_reusable_remainder: scrapMm >= minRemainder,
          smooth_cut_applied: Boolean(productCutSettings?.smooth_cut),
          notes: `Estimación genérica (sin despiece configurado) · Deducción: ${estimate.end_deduction_mm} mm · Longitud corte: ${cutLength} mm`,
        });
      }
    }
  }

  const totalFabricM2 = round2(canvasCuts.reduce((acc, c) => acc + c.total_area_m2, 0));
  const totalProfileBars = profileCuts.reduce((acc, p) => acc + p.bars_required, 0);

  const totalBarLengthProvided = totalProfileBars * stdBarMm;
  const totalScrapMm = profileCuts.reduce((acc, p) => acc + p.waste_scrap_total, 0);
  const totalScrapPercentage =
    totalBarLengthProvided > 0 ? round2((totalScrapMm / totalBarLengthProvided) * 100) : 0;

  return {
    has_canvas_cuts: canvasCuts.length > 0,
    has_profile_cuts: profileCuts.length > 0,
    canvas_cuts: canvasCuts,
    profile_cuts: profileCuts,
    total_fabric_m2: totalFabricM2,
    total_profile_bars: totalProfileBars,
    total_scrap_percentage: totalScrapPercentage,
  };
}
