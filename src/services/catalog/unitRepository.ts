import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type Unit = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  active: boolean;
};

export async function listUnits(companyId: number): Promise<Unit[]> {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  const { data, error } = await supabase
    .from('unit')
    .select('id,company_id,code,name,active')
    .eq('company_id', companyId)
    .eq('active', true)
    .is('deleted_at', null)
    .order('code');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as Unit[];
}
