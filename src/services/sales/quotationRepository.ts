import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type QuotationSummary = {
  id: number;
  code: string;
  issue_date: string;
  valid_until: string | null;
  status: string;
  total_amount: number;
  contact_name?: string | null;
  measurement_id?: number | null;
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

export function isQuotationExpired(quotation: { status: string; valid_until: string | null }): boolean {
  if (quotation.status === 'ACCEPTED' || quotation.status === 'CANCELLED') return false;
  if (quotation.status === 'EXPIRED') return true;
  if (!quotation.valid_until) return false;
  const today = new Date().toISOString().slice(0, 10);
  return quotation.valid_until < today;
}

export function getEffectiveStatus(quotation: { status: string; valid_until: string | null }): string {
  if (quotation.status === 'CANCELLED') return 'CANCELLED';
  if (isQuotationExpired(quotation)) {
    return 'EXPIRED';
  }
  return quotation.status;
}

export async function listQuotations(search='', includeCancelled=false): Promise<QuotationSummary[]> {
  const c=client();
  const cid=await companyId();
  let q=c.from('quotation').select('id,code,issue_date,valid_until,status,total_amount,contact_name,measurement_id,customer:customer_id(party:party_id(legal_name,trade_name)),commercial:commercial_id(party:party_id(legal_name,trade_name))').eq('company_id',cid).order('issue_date',{ascending:false}).order('id',{ascending:false});
  
  if (!includeCancelled) {
    q = q.neq('status', 'CANCELLED');
    try {
      q = q.is('deleted_at', null);
    } catch {
      // ignore
    }
  }

  const term=search.trim().replace(/[%_]/g,'');
  if(term) q=q.or(`code.ilike.%${term}%,reference.ilike.%${term}%,contact_name.ilike.%${term}%`);
  const {data,error}=await q;
  if(error && (error.message.includes('deleted_at') || error.code === '42703')) {
    // Fallback if deleted_at column is not yet present
    let qFallback = c.from('quotation').select('id,code,issue_date,valid_until,status,total_amount,contact_name,measurement_id,customer:customer_id(party:party_id(legal_name,trade_name)),commercial:commercial_id(party:party_id(legal_name,trade_name))').eq('company_id',cid).order('issue_date',{ascending:false}).order('id',{ascending:false});
    if (!includeCancelled) {
      qFallback = qFallback.neq('status', 'CANCELLED');
    }
    if (term) qFallback = qFallback.or(`code.ilike.%${term}%,reference.ilike.%${term}%,contact_name.ilike.%${term}%`);
    const { data: fallbackData, error: fallbackError } = await qFallback;
    if (fallbackError) throw new CoreRepositoryError(fallbackError.message);
    return (fallbackData ?? []) as unknown as QuotationSummary[];
  }
  if(error) throw new CoreRepositoryError(error.message);
  return (data??[]) as unknown as QuotationSummary[];
}

export async function cancelDraftQuotation(id: number, reason?: string): Promise<void> {
  const c = client();
  const cid = await companyId();
  const { data: user } = await c.auth.getUser();

  // Validate that quotation exists and is in DRAFT
  const { data: q, error: qe } = await c
    .from('quotation')
    .select('id,code,status,notes,measurement_id')
    .eq('company_id', cid)
    .eq('id', id)
    .maybeSingle();

  if (qe) throw new CoreRepositoryError(qe.message);
  if (!q) throw new CoreRepositoryError('Presupuesto no encontrado.');
  if (q.status !== 'DRAFT') {
    throw new CoreRepositoryError('Solo se pueden cancelar presupuestos en estado Borrador.');
  }

  const now = new Date().toISOString();
  let updatedNotes = q.notes || '';
  const cancelNote = `[PRESUPUESTO CANCELADO/OCULTADO${reason ? `: ${reason}` : ''} - ${new Date().toLocaleDateString('es-ES')}]`;
  updatedNotes = updatedNotes ? `${updatedNotes}\n${cancelNote}` : cancelNote;

  const payload: Record<string, any> = {
    status: 'CANCELLED',
    deleted_at: now,
    notes: updatedNotes,
    updated_at: now,
  };

  const { error } = await c.from('quotation').update(payload).eq('company_id', cid).eq('id', id);
  if (error && (error.message.includes('deleted_at') || error.code === '42703')) {
    const { error: err2 } = await c
      .from('quotation')
      .update({
        status: 'CANCELLED',
        notes: updatedNotes,
        updated_at: now,
      })
      .eq('company_id', cid)
      .eq('id', id);
    if (err2) throw new CoreRepositoryError(err2.message);
  } else if (error) {
    throw new CoreRepositoryError(error.message);
  }

  // If originating from a measurement, record activity on the measurement
  if (q.measurement_id) {
    try {
      await c.from('measurement_activity').insert({
        measurement_id: q.measurement_id,
        event_type: 'QUOTATION_CANCELLED',
        message: `Presupuesto borrador ${q.code} cancelado y ocultado.`,
        created_by: user.user?.id ?? null,
      });
    } catch {
      // Activity insert error shouldn't block quotation cancellation
    }
  }
}

export async function updateQuotationStatus(id: number, status: string, notes?: string): Promise<void> {
  const c=client();
  const cid=await companyId();
  const payload: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (notes !== undefined) {
    payload.notes = notes;
  }
  const {error} = await c.from('quotation').update(payload).eq('company_id', cid).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function renewQuotationValidity(id: number, newValidUntil: string): Promise<void> {
  const c=client();
  const cid=await companyId();
  const {error} = await c.from('quotation').update({
    valid_until: newValidUntil,
    status: 'SENT',
    updated_at: new Date().toISOString(),
  }).eq('company_id', cid).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function sendQuotationEmail(id: number, emailPayload: { to: string; subject: string; message: string; attachPdf?: boolean }): Promise<void> {
  const c=client();
  const cid=await companyId();
  const {error} = await c.from('quotation').update({
    status: 'SENT',
    updated_at: new Date().toISOString(),
  }).eq('company_id', cid).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}
