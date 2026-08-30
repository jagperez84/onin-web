import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type OtdScaleRow = {
  id: number;
  otd_id: number;
  dimension_values: number[];
  dimension_1: number;
  dimension_2: number | null;
  price: number;
  attribute_values: Record<string, number | string | boolean | null>;
  deleted_at?: string | null;
};

export type OtdScaleInput = {
  dimension_values: number[];
  price: number;
  attribute_values?: Record<string, number | string | boolean | null>;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

// dimension_1/dimension_2 are the columns the scale editor actually maintains;
// dimension_values is a derived convenience array that the editor never keeps
// in sync when a row's dimension_1/dimension_2 are edited after creation, so
// it must never be trusted over the two source columns — always rebuild it
// from them instead of reading whatever (possibly stale) array was stored.
function normalizeDimensionValues(row: any): number[] {
  const values = [Number(row.dimension_1)];
  if (row.dimension_2 != null) values.push(Number(row.dimension_2));
  return values;
}

export async function listOtdScales(otdId: number): Promise<OtdScaleRow[]> {
  const c = client();
  
  // 1. Try to fetch from otd_scale table if it exists
  try {
    const { data, error } = await c
      .from('otd_scale')
      .select('id, otd_id, dimension_values, dimension_1, dimension_2, price, attribute_values, deleted_at')
      .eq('otd_id', otdId)
      .is('deleted_at', null)
      .order('dimension_1')
      .order('dimension_2');

    if (!error && data) {
      return (data as any[]).map(r => ({
        id: Number(r.id),
        otd_id: Number(r.otd_id),
        dimension_values: normalizeDimensionValues(r),
        dimension_1: Number(r.dimension_1),
        dimension_2: r.dimension_2 == null ? null : Number(r.dimension_2),
        price: Number(r.price),
        attribute_values: r.attribute_values && typeof r.attribute_values === 'object' ? r.attribute_values : {},
        deleted_at: r.deleted_at ?? null,
      }));
    }
  } catch {
    // Fallback to otd_version snapshot
  }

  // 2. Fallback: check latest otd_version snapshot or otd.product_id
  try {
    const { data: vData } = await c
      .from('otd_version')
      .select('snapshot')
      .eq('otd_id', otdId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (vData?.snapshot?.scales && Array.isArray(vData.snapshot.scales)) {
      return (vData.snapshot.scales as any[]).map((r, idx) => ({
        id: Number(r.id || idx + 1),
        otd_id: otdId,
        dimension_values: normalizeDimensionValues(r),
        dimension_1: Number(r.dimension_1 ?? r.dimension_values?.[0] ?? 0),
        dimension_2: r.dimension_2 != null ? Number(r.dimension_2) : (r.dimension_values?.[1] != null ? Number(r.dimension_values[1]) : null),
        price: Number(r.price),
        attribute_values: r.attribute_values && typeof r.attribute_values === 'object' ? r.attribute_values : {},
        deleted_at: null,
      }));
    }

    // 3. Fallback: check if OTD has associated product_id with scales
    const { data: otdData } = await c.from('otd').select('product_id').eq('id', otdId).maybeSingle();
    if (otdData?.product_id) {
      const { data: pScales } = await c
        .from('product_scale')
        .select('id, product_id, dimension_values, dimension_1, dimension_2, price, attribute_values')
        .eq('product_id', otdData.product_id)
        .is('deleted_at', null)
        .order('dimension_1')
        .order('dimension_2');

      if (pScales && pScales.length) {
        return pScales.map(r => ({
          id: Number(r.id),
          otd_id: otdId,
          dimension_values: normalizeDimensionValues(r),
          dimension_1: Number(r.dimension_1),
          dimension_2: r.dimension_2 == null ? null : Number(r.dimension_2),
          price: Number(r.price),
          attribute_values: r.attribute_values && typeof r.attribute_values === 'object' ? r.attribute_values : {},
          deleted_at: null,
        }));
      }
    }
  } catch {
    // Ignore error and return empty
  }

  return [];
}

export function resolveOtdBasePriceFromScales(
  scales: OtdScaleRow[],
  dimensionValues: number[]
): {
  basePrice: number;
  scaleStep: { dimension_1: number; dimension_2: number | null; price: number } | null;
  found: boolean;
} {
  if (!scales.length) {
    return { basePrice: 0, scaleStep: null, found: false };
  }

  const dim1 = dimensionValues[0] ?? 0;
  const dim2 = dimensionValues.length > 1 ? dimensionValues[1] : null;

  // Filter candidates where scale dimensions >= required dimensions
  const candidates = scales.filter(s => {
    const sDim1 = s.dimension_values[0] ?? s.dimension_1;
    if (sDim1 < dim1) return false;

    if (dim2 !== null) {
      const sDim2 = s.dimension_values[1] ?? s.dimension_2;
      if (sDim2 !== null && sDim2 < dim2) return false;
    }
    return true;
  });

  if (!candidates.length) {
    // No step found large enough
    return { basePrice: 0, scaleStep: null, found: false };
  }

  // Sort candidate with smallest dimension_1, then smallest dimension_2
  candidates.sort((a, b) => {
    const a1 = a.dimension_values[0] ?? a.dimension_1;
    const b1 = b.dimension_values[0] ?? b.dimension_1;
    if (a1 !== b1) return a1 - b1;

    const a2 = a.dimension_values[1] ?? a.dimension_2 ?? 0;
    const b2 = b.dimension_values[1] ?? b.dimension_2 ?? 0;
    return a2 - b2;
  });

  const best = candidates[0];
  return {
    basePrice: Number(best.price),
    scaleStep: {
      dimension_1: best.dimension_values[0] ?? best.dimension_1,
      dimension_2: best.dimension_values[1] ?? best.dimension_2 ?? null,
      price: Number(best.price),
    },
    found: true,
  };
}
