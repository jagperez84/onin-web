import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type QuotationSummary = {
  id: number;
  code: string;
  issue_date: string;
  status: string;
  total_amount: number;
  customer: { party: { legal_name: string; trade_name: string | null } | null } | null;
  commercial: { party: { legal_name: string; trade_name: string | null } | null } | null;
};

function client(){ if(!supabase) throw new CoreRepositoryError('Supabase no está configurado.'); return supabase; }

async function companyId(): Promise<number> {
  const c=client();
  const {data:{user},error:ue}=await c.auth.getUser();
  if(ue || !user) throw new CoreRepositoryError('No hay un usuario autenticado.');
  const {data,error}=await c.from('user_account').select('company_id').eq('auth_user_id',user.id).maybeSingle();
  if(error) throw new CoreRepositoryError(error.message);
  if(data?.company_id==null) throw new CoreRepositoryError('El usuario no tiene empresa asignada.');
  return Number(data.company_id);
}

export async function listQuotations(search=''): Promise<QuotationSummary[]> {
  const c=client();
  const cid=await companyId();
  let q=c.from('quotation').select('id,code,issue_date,status,total_amount,customer:customer_id(party:party_id(legal_name,trade_name)),commercial:commercial_id(party:party_id(legal_name,trade_name))').eq('company_id',cid).order('issue_date',{ascending:false}).order('id',{ascending:false});
  const term=search.trim().replace(/[%_]/g,'');
  if(term) q=q.or(`code.ilike.%${term}%,reference.ilike.%${term}%`);
  const {data,error}=await q;
  if(error) throw new CoreRepositoryError(error.message);
  return (data??[]) as unknown as QuotationSummary[];
}
