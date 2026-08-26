import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type QuotationDashboardMetrics = {
  withoutInvoice: number;
  lastYearAmount: number;
  accepted: number;
  pending: number;
  total: number;
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

export async function getQuotationDashboardMetrics(): Promise<QuotationDashboardMetrics> {
  const c=client();
  const cid=await companyId();
  const from=new Date();
  from.setDate(from.getDate()-365);
  const fromDate=from.toISOString().slice(0,10);

  const [all,lastYear,accepted,pending]=await Promise.all([
    c.from('quotation').select('id',{count:'exact',head:true}).eq('company_id',cid),
    c.from('quotation').select('total_amount').eq('company_id',cid).gte('issue_date',fromDate),
    c.from('quotation').select('id',{count:'exact',head:true}).eq('company_id',cid).eq('status','ACCEPTED'),
    c.from('quotation').select('id',{count:'exact',head:true}).eq('company_id',cid).in('status',['DRAFT','SENT']),
  ]);
  for(const result of [all,lastYear,accepted,pending]) if(result.error) throw new CoreRepositoryError(result.error.message);

  return {
    // Invoice linkage is not part of the current quotation model, so every
    // quotation is currently unassociated with an invoice.
    withoutInvoice:Number(all.count??0),
    lastYearAmount:(lastYear.data??[]).reduce((sum,row)=>sum+Number(row.total_amount||0),0),
    accepted:Number(accepted.count??0),
    pending:Number(pending.count??0),
    total:Number(all.count??0),
  };
}
