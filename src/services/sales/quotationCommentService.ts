import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type QuotationComment = {
  id: number;
  quotationId: number;
  quotationLineId: number | null;
  text: string;
  isPublic: boolean;
  createdAt: string;
};

export type QuotationCommentDraft = { text: string; isPublic: boolean };

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export async function listQuotationComments(quotationId: number): Promise<QuotationComment[]> {
  const c = client();
  const { data, error } = await c
    .from('quotation_comment')
    .select('id,quotation_id,quotation_line_id,text,is_public,created_at')
    .eq('quotation_id', quotationId)
    .order('created_at');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map(row => ({
    id: Number(row.id),
    quotationId: Number(row.quotation_id),
    quotationLineId: row.quotation_line_id == null ? null : Number(row.quotation_line_id),
    text: row.text,
    isPublic: Boolean(row.is_public),
    createdAt: row.created_at,
  }));
}

/** Añade un comentario suelto (p. ej. el registro de aceptación/rechazo) a un presupuesto ya existente. */
export async function addQuotationComment(input: { quotationId: number; quotationLineId?: number | null; text: string; isPublic?: boolean }): Promise<void> {
  const c = client();
  const { error } = await c.from('quotation_comment').insert({
    quotation_id: input.quotationId,
    quotation_line_id: input.quotationLineId ?? null,
    text: input.text,
    is_public: input.isPublic ?? false,
  });
  if (error) throw new CoreRepositoryError(error.message);
}
