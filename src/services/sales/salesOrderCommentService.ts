import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type SalesOrderComment = {
  id: number;
  salesOrderId: number;
  salesOrderLineId: number | null;
  text: string;
  isPublic: boolean;
  createdAt: string;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

/** Comentarios internos heredados del presupuesto al crear el pedido (los no marcados como públicos). */
export async function listSalesOrderComments(salesOrderId: number): Promise<SalesOrderComment[]> {
  const c = client();
  const { data, error } = await c
    .from('sales_order_comment')
    .select('id,sales_order_id,sales_order_line_id,text,is_public,created_at')
    .eq('sales_order_id', salesOrderId)
    .order('created_at');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map(row => ({
    id: Number(row.id),
    salesOrderId: Number(row.sales_order_id),
    salesOrderLineId: row.sales_order_line_id == null ? null : Number(row.sales_order_line_id),
    text: row.text,
    isPublic: Boolean(row.is_public),
    createdAt: row.created_at,
  }));
}

export async function createSalesOrderComment(
  salesOrderId: number,
  text: string,
  isPublic = false,
  salesOrderLineId: number | null = null
): Promise<SalesOrderComment> {
  const c = client();
  const { data, error } = await c
    .from('sales_order_comment')
    .insert({
      sales_order_id: salesOrderId,
      sales_order_line_id: salesOrderLineId,
      text: text.trim(),
      is_public: isPublic,
    })
    .select('id,sales_order_id,sales_order_line_id,text,is_public,created_at')
    .single();
  if (error) throw new CoreRepositoryError(error.message);
  return {
    id: Number(data.id),
    salesOrderId: Number(data.sales_order_id),
    salesOrderLineId: data.sales_order_line_id == null ? null : Number(data.sales_order_line_id),
    text: data.text,
    isPublic: Boolean(data.is_public),
    createdAt: data.created_at,
  };
}
