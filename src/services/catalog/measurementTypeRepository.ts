import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type MeasurementDimension = {
  id?: number;
  measurement_type_id?: number;
  dimension_number: number;
  code: string;
  name: string;
  unit_id?: number | null;
  decimals: number;
};

export type MeasurementType = {
  id?: number;
  company_id?: number;
  code: string;
  name: string;
  dimension_count: number;
  result_unit_id?: number | null;
  result_decimals: number;
  calculation_type?: string | null;
  formula?: string | null;
  active: boolean;
  deleted_at?: string | null;
  dimensions: MeasurementDimension[];
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export async function listMeasurementTypes(companyId: number, search = ''): Promise<MeasurementType[]> {
  const c = client();
  let q = c.from('measurement_type').select('*').eq('company_id', companyId).eq('active', true).is('deleted_at', null).order('code');
  const term = search.trim().replace(/[%_]/g, '');
  if (term) q = q.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  const types = (data ?? []) as Omit<MeasurementType, 'dimensions'>[];
  if (!types.length) return [];
  const ids = types.map(t => t.id!).filter(Boolean);
  const { data: dimensions, error: dimensionError } = await c.from('measurement_type_dimension').select('*').in('measurement_type_id', ids).order('dimension_number');
  if (dimensionError) throw new CoreRepositoryError(dimensionError.message);
  return types.map(t => ({ ...t, dimensions: ((dimensions ?? []) as MeasurementDimension[]).filter(d => d.measurement_type_id === t.id) }));
}

export async function upsertMeasurementType(companyId: number, input: MeasurementType): Promise<void> {
  const c = client();
  const dimensions = input.dimensions.slice(0, input.dimension_count).map((d, index) => ({
    dimension_number: index + 1,
    code: d.code.trim(),
    name: d.name.trim(),
    unit_id: d.unit_id ?? null,
    decimals: d.decimals,
  }));

  if (dimensions.length !== input.dimension_count) {
    throw new CoreRepositoryError('La definición de dimensiones no coincide con el número indicado.');
  }

  const { error } = await c.rpc('upsert_measurement_type', {
    p_company_id: companyId,
    p_id: input.id ?? null,
    p_code: input.code.trim(),
    p_name: input.name.trim(),
    p_dimension_count: input.dimension_count,
    p_result_unit_id: input.result_unit_id ?? null,
    p_result_decimals: input.result_decimals,
    p_calculation_type: input.calculation_type?.trim() || null,
    p_formula: input.formula?.trim() || null,
    p_active: input.active,
    p_dimensions: dimensions,
  });

  if (error) throw new CoreRepositoryError(error.message);
}
