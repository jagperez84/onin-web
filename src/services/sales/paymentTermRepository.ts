import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type PaymentTermStatus = 'active' | 'inactive' | 'all';

export type PaymentTermInstallment = {
  sequence: number;
  percentage: number;
  days_offset: number;
  description: string | null;
};

export type PaymentTerm = {
  id: number; company_id: number; code: string | null; name: string; active: boolean;
  installments: PaymentTermInstallment[];
};

export type PaymentTermForm = {
  code: string | null;
  name: string;
  active: boolean;
  installments: PaymentTermInstallment[];
};

function client() { if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.'); return supabase; }

export async function listPaymentTerms(companyId: number, search = '', status: PaymentTermStatus = 'active'): Promise<PaymentTerm[]> {
  const c = client();
  let q = c.from('payment_term').select('id,company_id,code,name,active,installments:payment_term_installment(sequence,percentage,days_offset,description)').eq('company_id', companyId).order('name');
  if (status === 'active') q = q.eq('active', true);
  if (status === 'inactive') q = q.eq('active', false);
  const term = search.trim().replace(/[%_]/g, '');
  if (term) q = q.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map((row: any) => ({
    ...row,
    installments: (row.installments ?? []).sort((a: any, b: any) => a.sequence - b.sequence),
  })) as PaymentTerm[];
}

export async function getPaymentTerm(companyId: number, id: number): Promise<PaymentTerm> {
  const c = client();
  const { data, error } = await c.from('payment_term').select('id,company_id,code,name,active,installments:payment_term_installment(sequence,percentage,days_offset,description)').eq('company_id', companyId).eq('id', id).single();
  if (error) throw new CoreRepositoryError(error.message);
  const row = data as any;
  return { ...row, installments: (row.installments ?? []).sort((a: any, b: any) => a.sequence - b.sequence) } as PaymentTerm;
}

async function replaceInstallments(c: ReturnType<typeof client>, paymentTermId: number, installments: PaymentTermInstallment[]): Promise<void> {
  const { error: delError } = await c.from('payment_term_installment').delete().eq('payment_term_id', paymentTermId);
  if (delError) throw new CoreRepositoryError(delError.message);
  if (!installments.length) return;
  const rows = installments.map((i, idx) => ({
    payment_term_id: paymentTermId,
    sequence: idx + 1,
    percentage: i.percentage,
    days_offset: i.days_offset,
    description: i.description?.trim() || null,
  }));
  const { error: insError } = await c.from('payment_term_installment').insert(rows);
  if (insError) throw new CoreRepositoryError(insError.message);
}

export async function createPaymentTerm(companyId: number, input: PaymentTermForm): Promise<number> {
  const c = client();
  const { data, error } = await c.from('payment_term').insert({ company_id: companyId, code: input.code, name: input.name, active: input.active }).select('id').single();
  if (error) throw new CoreRepositoryError(error.message);
  const id = Number(data.id);
  await replaceInstallments(c, id, input.installments);
  return id;
}

export async function updatePaymentTerm(companyId: number, id: number, input: PaymentTermForm): Promise<void> {
  const c = client();
  const { error } = await c.from('payment_term').update({ code: input.code, name: input.name, active: input.active, updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
  await replaceInstallments(c, id, input.installments);
}
