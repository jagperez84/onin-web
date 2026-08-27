import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { getLonaConfectionWorkSheet, type LonaConfectionWorkSheet } from './lonaConfectionService';

export type { LonaConfectionWorkSheet } from './lonaConfectionService';

export async function getLonaConfectionWorkSheetBySalesOrderLine(orderLineId: number): Promise<LonaConfectionWorkSheet | null> {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');

  const { data, error } = await supabase
    .from('production_work_sheet')
    .select('id')
    .eq('sales_order_line_id', orderLineId)
    .eq('document_type', 'LONA_CONFECTION')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new CoreRepositoryError(error.message);
  if (!data) return null;

  return getLonaConfectionWorkSheet(Number(data.id));
}

export async function getLonaConfectionWorkSheetsBySalesOrder(salesOrderId: number): Promise<LonaConfectionWorkSheet[]> {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');

  const { data, error } = await supabase
    .from('production_work_sheet')
    .select('id')
    .eq('sales_order_id', salesOrderId)
    .eq('document_type', 'LONA_CONFECTION')
    .order('sales_order_line_no', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw new CoreRepositoryError(error.message);
  const ids = (data ?? []).map(row => Number(row.id)).filter(Number.isFinite);
  const sheets = await Promise.all(ids.map(id => getLonaConfectionWorkSheet(id)));
  return sheets.filter((sheet): sheet is LonaConfectionWorkSheet => sheet !== null);
}
