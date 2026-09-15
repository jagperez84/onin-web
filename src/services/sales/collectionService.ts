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
  customerId: number | null;
  customerName: string | null;
};

/** Vencimiento próximo (≤3 días) o ya vencido de un plazo pendiente, para resaltarlo en pantalla. */
export function urgency(row: CollectionRow): 'overdue' | 'soon' | null {
  if (row.status !== 'PENDING') return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${row.dueDate}T00:00:00`);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 3) return 'soon';
  return null;
}

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
  'invoice:invoice_id(id,code,invoice_type,status,customer_id,customer:customer_id(party:party_id(legal_name,trade_name)))';

/** IDs de cliente con algún plazo de cobro pendiente y ya vencido (impago), para marcarlos en el listado de clientes. */
export async function listCustomerIdsWithOverdueCollections(): Promise<Set<number>> {
  const c = client();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const { data, error } = await c
    .from('invoice_installment')
    .select('invoice:invoice_id(customer_id)')
    .eq('status', 'PENDING')
    .lt('due_date', todayStr);
  if (error) throw new CoreRepositoryError(error.message);
  const ids = new Set<number>();
  for (const row of data || []) {
    const invoice = one((row as any).invoice);
    if (invoice?.customer_id != null) ids.add(Number(invoice.customer_id));
  }
  return ids;
}

export async function listCollections(filters: { status?: InstallmentStatus | 'ALL'; search?: string; customerId?: number } = {}): Promise<CollectionRow[]> {
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
      customerId: invoice?.customer_id == null ? null : Number(invoice.customer_id),
      customerName: mapPartyCustomer(invoice?.customer),
    } as CollectionRow;
  });
  if (filters.customerId != null) rows = rows.filter((r) => r.customerId === filters.customerId);
  const term = filters.search?.trim().toLowerCase();
  if (term) {
    rows = rows.filter((r) => r.invoiceCode.toLowerCase().includes(term) || (r.customerName || '').toLowerCase().includes(term));
  }
  return rows;
}
