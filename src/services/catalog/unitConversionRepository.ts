import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import type { Unit } from './unitRepository';

export type UnitConversion = {
  id: number;
  company_id: number;
  from_unit_id: number;
  to_unit_id: number;
  factor: number;
  offset_val: number;
  active: boolean;
};

export class IncompatibleUnitMagnitudeError extends Error {
  constructor(public fromUnit: string, public toUnit: string, message?: string) {
    super(
      message ||
        `No es posible convertir entre magnitudes incompatibles: '${fromUnit}' y '${toUnit}'.`
    );
    this.name = 'IncompatibleUnitMagnitudeError';
  }
}

export class UnitConversionMissingError extends Error {
  constructor(public fromUnit: string, public toUnit: string, message?: string) {
    super(
      message ||
        `No existe factor de conversión configurado entre la unidad '${fromUnit}' y '${toUnit}'.`
    );
    this.name = 'UnitConversionMissingError';
  }
}

// Built-in standard conversion ratios relative to SI Base Unit for fallback
const SI_LENGTH_FACTORS: Record<string, number> = {
  mm: 0.001,
  cm: 0.01,
  dm: 0.1,
  m: 1.0,
  ml: 1.0, // Metro lineal
  mts: 1.0,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
};

const SI_AREA_FACTORS: Record<string, number> = {
  mm2: 0.000001,
  'mm²': 0.000001,
  cm2: 0.0001,
  'cm²': 0.0001,
  dm2: 0.01,
  'dm²': 0.01,
  m2: 1.0,
  'm²': 1.0,
};

const SI_VOLUME_FACTORS: Record<string, number> = {
  ml: 0.000001,
  ml_vol: 0.000001,
  l: 0.001,
  litro: 0.001,
  cm3: 0.000001,
  'cm³': 0.000001,
  dm3: 0.001,
  'dm³': 0.001,
  m3: 1.0,
  'm³': 1.0,
};

const SI_MASS_FACTORS: Record<string, number> = {
  mg: 0.000001,
  g: 0.001,
  kg: 1.0,
  kilo: 1.0,
  t: 1000.0,
  ton: 1000.0,
};

const SI_COUNT_FACTORS: Record<string, number> = {
  ud: 1.0,
  un: 1.0,
  und: 1.0,
  unidad: 1.0,
  par: 2.0,
  docena: 12.0,
};

function normalizeUnitCode(code: string | null | undefined): string {
  if (!code) return '';
  return code.trim().toLowerCase();
}

function detectMagnitude(code: string): 'LENGTH' | 'AREA' | 'VOLUME' | 'MASS' | 'COUNT' | 'UNKNOWN' {
  const c = normalizeUnitCode(code);
  if (SI_LENGTH_FACTORS[c] !== undefined) return 'LENGTH';
  if (SI_AREA_FACTORS[c] !== undefined) return 'AREA';
  if (SI_VOLUME_FACTORS[c] !== undefined) return 'VOLUME';
  if (SI_MASS_FACTORS[c] !== undefined) return 'MASS';
  if (SI_COUNT_FACTORS[c] !== undefined) return 'COUNT';
  return 'UNKNOWN';
}

export async function listUnitConversions(companyId: number): Promise<UnitConversion[]> {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  const { data, error } = await supabase
    .from('unit_conversion')
    .select('id,company_id,from_unit_id,to_unit_id,factor,offset_val,active')
    .eq('company_id', companyId)
    .eq('active', true);
  if (error) {
    // If table not yet available in cache, return empty array
    return [];
  }
  return (data ?? []).map((row: any) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    from_unit_id: Number(row.from_unit_id),
    to_unit_id: Number(row.to_unit_id),
    factor: Number(row.factor),
    offset_val: Number(row.offset_val ?? 0),
    active: Boolean(row.active),
  }));
}

export function getConversionFactorFromCodes(
  fromCode: string,
  toCode: string
): number {
  const cFrom = normalizeUnitCode(fromCode);
  const cTo = normalizeUnitCode(toCode);

  if (cFrom === cTo) return 1.0;

  const magFrom = detectMagnitude(cFrom);
  const magTo = detectMagnitude(cTo);

  if (magFrom !== 'UNKNOWN' && magTo !== 'UNKNOWN' && magFrom !== magTo) {
    throw new IncompatibleUnitMagnitudeError(fromCode, toCode);
  }

  if (magFrom === 'LENGTH' && magTo === 'LENGTH') {
    const fFrom = SI_LENGTH_FACTORS[cFrom];
    const fTo = SI_LENGTH_FACTORS[cTo];
    if (fFrom && fTo) return fFrom / fTo;
  }

  if (magFrom === 'AREA' && magTo === 'AREA') {
    const fFrom = SI_AREA_FACTORS[cFrom];
    const fTo = SI_AREA_FACTORS[cTo];
    if (fFrom && fTo) return fFrom / fTo;
  }

  if (magFrom === 'VOLUME' && magTo === 'VOLUME') {
    const fFrom = SI_VOLUME_FACTORS[cFrom];
    const fTo = SI_VOLUME_FACTORS[cTo];
    if (fFrom && fTo) return fFrom / fTo;
  }

  if (magFrom === 'MASS' && magTo === 'MASS') {
    const fFrom = SI_MASS_FACTORS[cFrom];
    const fTo = SI_MASS_FACTORS[cTo];
    if (fFrom && fTo) return fFrom / fTo;
  }

  if (magFrom === 'COUNT' && magTo === 'COUNT') {
    const fFrom = SI_COUNT_FACTORS[cFrom];
    const fTo = SI_COUNT_FACTORS[cTo];
    if (fFrom && fTo) return fFrom / fTo;
  }

  throw new UnitConversionMissingError(fromCode, toCode);
}

export function convertUnitValue(options: {
  value: number;
  fromUnit?: { id?: number | null; code?: string | null; magnitude_id?: number | null; magnitude?: { code: string } | null } | null;
  toUnit?: { id?: number | null; code?: string | null; magnitude_id?: number | null; magnitude?: { code: string } | null } | null;
  conversions?: UnitConversion[];
  unitsMap?: Map<number, Unit>;
}): number {
  const { value, fromUnit, toUnit, conversions, unitsMap } = options;

  if (!Number.isFinite(value)) return 0;
  if (!fromUnit || !toUnit) return value;

  const fromId = fromUnit.id ?? null;
  const toId = toUnit.id ?? null;

  if (fromId != null && toId != null && fromId === toId) {
    return value;
  }

  const fromCode = fromUnit.code || (fromId && unitsMap?.get(fromId)?.code) || '';
  const toCode = toUnit.code || (toId && unitsMap?.get(toId)?.code) || '';

  if (normalizeUnitCode(fromCode) === normalizeUnitCode(toCode)) {
    return value;
  }

  // 1. Check direct table conversions
  if (conversions && fromId != null && toId != null) {
    const direct = conversions.find(
      c => c.active && c.from_unit_id === fromId && c.to_unit_id === toId
    );
    if (direct) {
      return value * direct.factor + (direct.offset_val || 0);
    }

    // Check inverse
    const inverse = conversions.find(
      c => c.active && c.from_unit_id === toId && c.to_unit_id === fromId
    );
    if (inverse && inverse.factor > 0) {
      return (value - (inverse.offset_val || 0)) / inverse.factor;
    }
  }

  // 2. Validate magnitude compatibility if metadata is present
  const magCodeFrom = fromUnit.magnitude?.code;
  const magCodeTo = toUnit.magnitude?.code;
  if (magCodeFrom && magCodeTo && magCodeFrom !== magCodeTo) {
    throw new IncompatibleUnitMagnitudeError(fromCode || `ID:${fromId}`, toCode || `ID:${toId}`);
  }

  // 3. Fallback to standard metric / code conversion
  if (fromCode && toCode) {
    const factor = getConversionFactorFromCodes(fromCode, toCode);
    return value * factor;
  }

  return value;
}

export function areUnitsMagnitudeCompatible(
  unit1: Unit | null | undefined,
  unit2: Unit | null | undefined
): boolean {
  if (!unit1 || !unit2) return true;
  if (unit1.id === unit2.id) return true;
  if (unit1.magnitude_id && unit2.magnitude_id && unit1.magnitude_id !== unit2.magnitude_id) {
    return false;
  }
  const mag1 = detectMagnitude(unit1.code);
  const mag2 = detectMagnitude(unit2.code);
  if (mag1 !== 'UNKNOWN' && mag2 !== 'UNKNOWN' && mag1 !== mag2) {
    return false;
  }
  return true;
}
