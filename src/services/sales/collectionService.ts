import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import type { InstallmentStatus, InvoiceStatus, InvoiceType } from './invoiceService';

export type CollectionRow = {
  id: number;
  sequence: number;
  percentage: number;
  dueDate: string;
  amount: number;
  status: InstallmentStatus;
  collectedAmount: number | null;
  collectedDate: string | null;
  collectedNotes: string | null;
  invoiceId: number;
  invoiceCode: string;
  invoiceType: InvoiceType;
  invoiceStatus: InvoiceStatus;
  customerName: string | null;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapPartyCustomer(value: any): string | null {
  const customer = one(value);
  const party = one(customer?.party);
  return party?.trade_name || party?.legal_name || null;
}

const SELECT =
  'id,sequence,percentage,due_date,amount,status,collected_amount,collected_date,collected_notes,' +
  'invoice:invoice_id(id,code,invoice_type,status,customer:customer_id(party:party_id(legal_name,trade_name)))';

export async function listCollections(filters: { status?: InstallmentStatus | 'ALL'; search?: string } = {}): Promise<CollectionRow[]> {
  const c = client();
  let q = c.from('invoice_installment').select(SELECT).order('due_date', { ascending: true });
  if (filters.status && filters.status !== 'ALL') q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  let rows = (data || []).map((row: any) => {
    const invoice = one(row.invoice);
    return {
      id: Number(row.id),
      sequence: Number(row.sequence),
      percentage: Number(row.percentage),
      dueDate: row.due_date,
      amount: Number(row.amount),
      status: row.status,
      collectedAmount: row.collected_amount == null ? null : Number(row.collected_amount),
      collectedDate: row.collected_date,
      collectedNotes: row.collected_notes,
      invoiceId: Number(invoice?.id),
      invoiceCode: invoice?.code || '',
      invoiceType: invoice?.invoice_type,
      invoiceStatus: invoice?.status,
      customerName: mapPartyCustomer(invoice?.customer),
    } as CollectionRow;
  });
  const term = filters.search?.trim().toLowerCase();
  if (term) {
    rows = rows.filter((r) => r.invoiceCode.toLowerCase().includes(term) || (r.customerName || '').toLowerCase().includes(term));
  }
  return rows;
}
