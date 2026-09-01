import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from './coreRepository';

export type CompanyOption = {
  id: number;
  code: string;
  name: string;
  active: boolean;
  is_current: boolean;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export async function listMyCompanies(): Promise<CompanyOption[]> {
  const { data, error } = await client().rpc('list_my_companies');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as CompanyOption[];
}

export async function switchMyCompany(companyId: number): Promise<void> {
  const { error } = await client().rpc('switch_my_company', {
    p_company_id: companyId,
  });
  if (error) throw new CoreRepositoryError(error.message);
}
