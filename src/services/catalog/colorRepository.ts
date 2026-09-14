import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type Color = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  active: boolean;
};

export type ColorInput = { code: string; name: string; active: boolean };

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export async function listColors(companyId: number, includeInactive = false): Promise<Color[]> {
  const c = client();
  let q = c.from('color').select('id,company_id,code,name,active').eq('company_id', companyId).order('name');
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as Color[];
}

export async function createColor(companyId: number, input: ColorInput): Promise<Color> {
  const c = client();
  const { data, error } = await c
    .from('color')
    .insert({ company_id: companyId, ...input })
    .select('id,company_id,code,name,active')
    .single();
  if (error) throw new CoreRepositoryError(error.message);
  return data as Color;
}

export async function updateColor(id: number, input: ColorInput): Promise<void> {
  const c = client();
  const { error } = await c.from('color').update(input).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function setColorActive(id: number, active: boolean): Promise<void> {
  const c = client();
  const { error } = await c.from('color').update({ active }).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}
