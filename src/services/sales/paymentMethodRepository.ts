import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type PaymentMethodStatus = 'active' | 'inactive' | 'all';
export type PaymentMethod = {
  id: number; company_id: number; code: string | null; name: string; active: boolean;
};
export type PaymentMethodForm = Omit<PaymentMethod, 'id' | 'company_id'>;

function client() { if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.'); return supabase; }

export async function listPaymentMethods(companyId: number, search = '', status: PaymentMethodStatus = 'active'): Promise<PaymentMethod[]> {
  const c = client();
  let q = c.from('payment_method').select('id,company_id,code,name,active').eq('company_id', companyId).order('name');
  if (status === 'active') q = q.eq('active', true);
  if (status === 'inactive') q = q.eq('active', false);
  const term = search.trim().replace(/[%_]/g, '');
  if (term) q = q.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as PaymentMethod[];
}

export async function getPaymentMethod(companyId: number, id: number): Promise<PaymentMethod> {
  const c = client();
  const { data, error } = await c.from('payment_method').select('id,company_id,code,name,active').eq('company_id', companyId).eq('id', id).single();
  if (error) throw new CoreRepositoryError(error.message);
  return data as PaymentMethod;
}

export async function createPaymentMethod(companyId: number, input: PaymentMethodForm): Promise<number> {
  const c = client();
  const { data, error } = await c.from('payment_method').insert({ company_id: companyId, ...input }).select('id').single();
  if (error) throw new CoreRepositoryError(error.message);
  return Number(data.id);
}

export async function updatePaymentMethod(companyId: number, id: number, input: Partial<PaymentMethodForm>): Promise<void> {
  const c = client();
  const { error } = await c.from('payment_method').update({ ...input, updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}
