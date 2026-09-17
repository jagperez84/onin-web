import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { markForDeletion } from '../core/softDeleteRepository';

export type ConditionDataType = 'BOOLEAN' | 'TEXT' | 'NUMBER' | 'SELECT';
export type InstallationConditionOption = { id: number; condition_type_id: number; code: string; name: string; sort_order: number };
export type InstallationConditionType = { id: number; company_id: number; code: string; name: string; data_type: ConditionDataType; unit_id: number | null; sort_order: number; options: InstallationConditionOption[] };
export type MeasurementOpening = { id: number; measurement_id: number; sort_order: number; label: string | null; otd_id: number | null; observations: string | null; active: boolean; deleted_at: string | null };
export type OtdDimensionSelection = { code: string; name: string; unit_id: number | null; sort_order: number };
export type MeasurementOpeningDimension = { id?: number; opening_id?: number; code: string; name: string; value: number | null; unit_id: number | null; sort_order: number };
export type MeasurementOpeningCondition = { id?: number; opening_id?: number; condition_type_id: number; option_id: number | null; value_text: string | null; value_number: number | null; value_boolean: boolean | null };
export type MeasurementOpeningFull = MeasurementOpening & { dimensions: MeasurementOpeningDimension[]; conditions: MeasurementOpeningCondition[] };

function client() { if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.'); return supabase; }

export async function listInstallationConditionTypes(companyId: number): Promise<InstallationConditionType[]> {
  const c = client();
  const { data, error } = await c
    .from('installation_condition_type')
    .select('id,company_id,code,name,data_type,unit_id,sort_order,options:installation_condition_option(id,condition_type_id,code,name,sort_order)')
    .eq('company_id', companyId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('sort_order');
  if (error) throw new CoreRepositoryError(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    options: (row.options ?? []).sort((a: InstallationConditionOption, b: InstallationConditionOption) => a.sort_order - b.sort_order),
  })) as InstallationConditionType[];
}

export async function listMeasurementOpenings(measurementId: number): Promise<MeasurementOpeningFull[]> {
  const c = client();
  const { data, error } = await c
    .from('measurement_opening')
    .select('*, dimensions:measurement_opening_dimension(*), conditions:measurement_opening_condition(*)')
    .eq('measurement_id', measurementId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('sort_order');
  if (error) throw new CoreRepositoryError(error.message);
  return ((data ?? []) as any[]).map((row) => ({
    ...row,
    dimensions: (row.dimensions ?? []).sort((a: MeasurementOpeningDimension, b: MeasurementOpeningDimension) => a.sort_order - b.sort_order),
  })) as MeasurementOpeningFull[];
}

export async function listOtdDimensionSelections(otdId: number): Promise<OtdDimensionSelection[]> {
  const c = client();
  const { data, error } = await c
    .from('otd_selection')
    .select('code,name,unit_id,sort_order')
    .eq('otd_id', otdId)
    .eq('is_dimension', true)
    .order('sort_order');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as OtdDimensionSelection[];
}

export async function createMeasurementOpening(measurementId: number, sortOrder: number): Promise<number> {
  const c = client();
  const { data, error } = await c.from('measurement_opening').insert({ measurement_id: measurementId, sort_order: sortOrder }).select('id').single();
  if (error) throw new CoreRepositoryError(error.message);
  return Number(data.id);
}

export async function updateMeasurementOpening(id: number, changes: Partial<Pick<MeasurementOpening, 'label' | 'otd_id' | 'observations'>>): Promise<void> {
  const c = client();
  const { error } = await c.from('measurement_opening').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function markMeasurementOpeningForDeletion(id: number): Promise<void> {
  await markForDeletion('measurement_opening', id);
}

export async function replaceMeasurementOpeningDimensions(openingId: number, dimensions: MeasurementOpeningDimension[]): Promise<void> {
  const c = client();
  const { error: delError } = await c.from('measurement_opening_dimension').delete().eq('opening_id', openingId);
  if (delError) throw new CoreRepositoryError(delError.message);
  if (!dimensions.length) return;
  const rows = dimensions.map((d, idx) => ({ opening_id: openingId, code: d.code, name: d.name, value: d.value, unit_id: d.unit_id, sort_order: idx + 1 }));
  const { error: insError } = await c.from('measurement_opening_dimension').insert(rows);
  if (insError) throw new CoreRepositoryError(insError.message);
}

export async function replaceMeasurementOpeningConditions(openingId: number, conditions: MeasurementOpeningCondition[]): Promise<void> {
  const c = client();
  const { error: delError } = await c.from('measurement_opening_condition').delete().eq('opening_id', openingId);
  if (delError) throw new CoreRepositoryError(delError.message);
  // Solo se insertan las condiciones con valor: la restricción de la tabla exige
  // exactamente un valor relleno, y no tiene sentido guardar una fila vacía.
  const rows = conditions
    .filter((cnd) => cnd.value_text != null || cnd.value_number != null || cnd.value_boolean != null || cnd.option_id != null)
    .map((cnd) => ({
      opening_id: openingId,
      condition_type_id: cnd.condition_type_id,
      option_id: cnd.option_id,
      value_text: cnd.value_text,
      value_number: cnd.value_number,
      value_boolean: cnd.value_boolean,
    }));
  if (!rows.length) return;
  const { error: insError } = await c.from('measurement_opening_condition').insert(rows);
  if (insError) throw new CoreRepositoryError(insError.message);
}
