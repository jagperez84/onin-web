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
  const now = new Date().toISOString();
  const base = {
    company_id: companyId,
    code: input.code.trim(),
    name: input.name.trim(),
    dimension_count: input.dimension_count,
    result_unit_id: input.result_unit_id ?? null,
    result_decimals: input.result_decimals,
    calculation_type: input.calculation_type?.trim() || null,
    formula: input.formula?.trim() || null,
    active: input.active,
    deleted_at: null,
    deleted_by: null,
    updated_at: now,
  };
  const { data, error } = input.id
    ? await c.from('measurement_type').update(base).eq('id', input.id).eq('company_id', companyId).select('id').single()
    : await c.from('measurement_type').insert(base).select('id').single();
  if (error) throw new CoreRepositoryError(error.message);
  const id = data.id as number;
  const { error: deleteError } = await c.from('measurement_type_dimension').delete().eq('measurement_type_id', id);
  if (deleteError) throw new CoreRepositoryError(deleteError.message);
  const dimensions = input.dimensions.slice(0, input.dimension_count).map((d, index) => ({
    measurement_type_id: id,
    dimension_number: index + 1,
    code: d.code.trim(),
    name: d.name.trim(),
    unit_id: d.unit_id ?? null,
    decimals: d.decimals,
  }));
  if (dimensions.length) {
    const { error: insertError } = await c.from('measurement_type_dimension').insert(dimensions);
    if (insertError) throw new CoreRepositoryError(insertError.message);
  }
}
