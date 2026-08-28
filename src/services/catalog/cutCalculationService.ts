import { round2 } from './productPricingService';
import type { EvaluatedBomComponent } from './billOfMaterialsService';

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

export type CutCalculationInput = {
  productCode: string;
  productName: string;
  dimensions: Record<string, number | null>;
  quantity: number;
  lineBehavior?: {
    cut_calculation_enabled?: boolean;
    canvas_cut_enabled?: boolean;
    length_enabled?: boolean;
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

  const dimEntries = Object.entries(dimensions).filter(([_, v]) => v != null && Number.isFinite(v));
  const rawW = dimEntries[0]?.[1] ?? 0; // typically Ancho / Width (in meters or mm)
  const rawH = dimEntries[1]?.[1] ?? 0; // typically Salida / Height

  // Normalize to meters: if > 50, likely in mm or cm, convert to meters
  const widthMeters = rawW > 50 ? rawW / 1000 : rawW;
  const heightMeters = rawH > 50 ? rawH / 1000 : rawH;
  const widthMm = Math.round(widthMeters * 1000);
  const heightMm = Math.round(heightMeters * 1000);

  const canvasCuts: CanvasCutPiece[] = [];
  const profileCuts: ProfileCutItem[] = [];

  const shouldCalculateCanvas =
    Boolean(lineBehavior?.canvas_cut_enabled) ||
    Boolean(family?.confectionable) ||
    widthMeters > 0 && heightMeters > 0;

  const shouldCalculateProfiles =
    Boolean(lineBehavior?.cut_calculation_enabled) ||
    Boolean(lineBehavior?.length_enabled) ||
    Boolean(family?.recuttable) ||
    widthMeters > 0;

  // 1. Canvas / Fabric Cuts
  if (shouldCalculateCanvas && widthMeters > 0) {
    const seamWidth = 0.04; // 40mm hems
    const seamHeight = 0.25; // 250mm roll wrap and bottom hem
    const cutW = round2(widthMeters + seamWidth);
    const cutH = round2((heightMeters || 1) + seamHeight);
    const rollWidth = 1.20; // 120cm standard roll width
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

    // Faldón / bambalina: en Toldos era un componente propio del modelo de artículo
    // (variable condicional, no una pieza universal). Se añade solo si el despiece
    // evaluado de este artículo concreto realmente lo lleva.
    const valanceComponent = bomComponents.find(comp =>
      /fald[oó]n|bambalina|valance/i.test(`${comp.code} ${comp.description}`)
    );
    if (valanceComponent && valanceComponent.quantity > 0) {
      const heightDimension = valanceComponent.evaluated_dimensions?.find(d =>
        /alto|altura|height|salida/i.test(`${d.dimension_code} ${d.dimension_name}`)
      );
      const unitToMeters = (unit?: string) => {
        const key = (unit || '').trim().toLowerCase();
        if (key === 'mm') return 0.001;
        if (key === 'cm') return 0.01;
        return 1; // m or unrecognized: assume meters
      };
      const valanceH = heightDimension
        ? heightDimension.value * unitToMeters(heightDimension.unit_code)
        : widthMeters > 0
          ? round2(valanceComponent.quantity / (widthMeters * quantity))
          : null;

      if (valanceH && valanceH > 0) {
        canvasCuts.push({
          id: `canvas-valance-${valanceComponent.id}`,
          name: valanceComponent.description || 'Faldón / Bambalina',
          fabric_code: valanceComponent.code,
          fabric_color: characteristicColor || 'Estándar',
          nominal_width: widthMeters,
          nominal_height: valanceH,
          seam_allowance_width: seamWidth,
          seam_allowance_height: 0.05,
          cut_width: cutW,
          cut_height: round2(valanceH + 0.05),
          cloth_strips_count: strips * quantity,
          roll_width_used: rollWidth,
          total_area_m2: round2(cutW * (valanceH + 0.05) * quantity),
          confection_notes: 'Corte con onda estándar y ribete a juego (según despiece del artículo)',
        });
      }
    }
  }

  // 2. Profile Cuts
  if (shouldCalculateProfiles && widthMm > 0) {
    const minRemainder = productCutSettings?.minimum_remainder ?? family?.minimum_remainder ?? 500; // 500mm
    const smoothCutMargin = productCutSettings?.smooth_cut ? 4 : 2; // mm blade kerf
    const stdBarMm = 6000; // 6 meters bar length

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
      // (front load profile + roller tube) instead of leaving the quote without a cut preview.
      // These are placeholder deductions, not article-specific data — replace with real BOM
      // components as soon as this article's despiece is configured.
      const loadProfileCutLength = Math.max(10, widthMm - 60); // 60mm deduction for end caps
      const piecesPerBar1 = Math.floor(stdBarMm / (loadProfileCutLength + smoothCutMargin)) || 1;
      const barsReq1 = Math.ceil(quantity / piecesPerBar1);
      const scrapMm1 = (barsReq1 * stdBarMm) - (quantity * (loadProfileCutLength + smoothCutMargin));

      profileCuts.push({
        id: 'prof-load-1',
        profile_code: 'PRF-CARGA',
        profile_name: 'Perfil Frontal de Carga / Terminal (estimado)',
        color: characteristicColor || 'Aluminio estándar',
        cut_length: loadProfileCutLength,
        unit: 'mm',
        quantity_pieces: quantity,
        standard_bar_length: stdBarMm,
        bars_required: barsReq1,
        waste_scrap_total: Math.max(0, scrapMm1),
        scrap_remainder: Math.max(0, scrapMm1 % stdBarMm),
        is_reusable_remainder: scrapMm1 >= minRemainder,
        smooth_cut_applied: Boolean(productCutSettings?.smooth_cut),
        notes: `Estimación genérica (sin despiece configurado) · Deducción tapones: 60 mm · Longitud corte: ${loadProfileCutLength} mm`,
      });

      const tubeCutLength = Math.max(10, widthMm - 75); // 75mm deduction for brackets and motor
      const piecesPerBar2 = Math.floor(stdBarMm / (tubeCutLength + smoothCutMargin)) || 1;
      const barsReq2 = Math.ceil(quantity / piecesPerBar2);
      const scrapMm2 = (barsReq2 * stdBarMm) - (quantity * (tubeCutLength + smoothCutMargin));

      profileCuts.push({
        id: 'prof-tube-2',
        profile_code: 'TUB-ENROLLE',
        profile_name: 'Tubo de Enrolle Ranurado (estimado)',
        color: 'Galvanizado',
        cut_length: tubeCutLength,
        unit: 'mm',
        quantity_pieces: quantity,
        standard_bar_length: stdBarMm,
        bars_required: barsReq2,
        waste_scrap_total: Math.max(0, scrapMm2),
        scrap_remainder: Math.max(0, scrapMm2 % stdBarMm),
        is_reusable_remainder: scrapMm2 >= minRemainder,
        smooth_cut_applied: Boolean(productCutSettings?.smooth_cut),
        notes: `Estimación genérica (sin despiece configurado) · Deducción soportes y motor: 75 mm · Longitud corte: ${tubeCutLength} mm`,
      });
    }
  }

  const totalFabricM2 = round2(canvasCuts.reduce((acc, c) => acc + c.total_area_m2, 0));
  const totalProfileBars = profileCuts.reduce((acc, p) => acc + p.bars_required, 0);

  const totalBarLengthProvided = totalProfileBars * 6000;
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
