import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type UnitMagnitude = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  active: boolean;
};

export type Unit = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  symbol?: string | null;
  magnitude_id?: number | null;
  magnitude?: UnitMagnitude | null;
  active: boolean;
};

export async function listUnits(companyId: number = 1): Promise<Unit[]> {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  const { data, error } = await supabase
    .from('unit')
    .select('id,company_id,code,name,symbol,magnitude_id,active,magnitude:magnitude_id(id,company_id,code,name,active)')
    .eq('company_id', companyId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('code');
  if (error) {
    // Fallback if magnitude relation is not yet loaded in PostgREST schema cache
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('unit')
      .select('id,company_id,code,name,active')
      .eq('company_id', companyId)
      .eq('active', true)
      .is('deleted_at', null)
      .order('code');
    if (fallbackError) throw new CoreRepositoryError(fallbackError.message);
    return (fallbackData ?? []) as Unit[];
  }
  return (data ?? []).map((u: any) => ({
    id: Number(u.id),
    company_id: Number(u.company_id),
    code: String(u.code),
    name: String(u.name),
    symbol: u.symbol || null,
    magnitude_id: u.magnitude_id == null ? null : Number(u.magnitude_id),
    magnitude: u.magnitude ? {
      id: Number(u.magnitude.id),
      company_id: Number(u.magnitude.company_id),
      code: String(u.magnitude.code),
      name: String(u.magnitude.name),
      active: Boolean(u.magnitude.active),
    } : null,
    active: Boolean(u.active),
  })) as Unit[];
}
