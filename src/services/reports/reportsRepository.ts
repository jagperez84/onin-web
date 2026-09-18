import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

async function companyId(): Promise<number> {
  const c = client();
  const { data: { user }, error: ue } = await c.auth.getUser();
  if (ue || !user) throw new CoreRepositoryError('No hay un usuario autenticado.');
  const { data, error } = await c.from('user_account').select('company_id').eq('auth_user_id', user.id).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  if (data?.company_id == null) throw new CoreRepositoryError('El usuario no tiene empresa asignada.');
  return Number(data.company_id);
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function partyName(value: any): string {
  const party = one(value);
  return party?.trade_name || party?.legal_name || 'Sin cliente';
}

export type DateRange = { from: string; to: string };

export function defaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 365);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ---------- Pipeline comercial (presupuestos) ----------

export const QUOTATION_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviado',
  ACCEPTED: 'Aceptado',
  REJECTED: 'Rechazado',
  EXPIRED: 'Caducado',
  CANCELLED: 'Cancelado',
};

export type StatusBreakdownRow = { status: QuotationStatus; label: string; count: number; amount: number };

export type OpenQuotationRow = {
  id: number;
  code: string;
  customerName: string;
  issueDate: string;
  daysOpen: number;
  amount: number;
};

export type PipelineReport = {
  totalCount: number;
  totalAmount: number;
  acceptedCount: number;
  acceptedAmount: number;
  acceptanceRate: number;
  openCount: number;
  openAmount: number;
  byStatus: StatusBreakdownRow[];
  oldestOpen: OpenQuotationRow[];
};

export async function getPipelineReport(range: DateRange): Promise<PipelineReport> {
  const c = client();
  const cid = await companyId();
  const { data, error } = await c
    .from('quotation')
    .select('id,code,status,total_amount,issue_date,customer:customer_id(party:party_id(legal_name,trade_name))')
    .eq('company_id', cid)
    .gte('issue_date', range.from)
    .lte('issue_date', range.to);
  if (error) throw new CoreRepositoryError(error.message);

  const rows = (data ?? []).map((row: any) => ({
    id: Number(row.id),
    code: row.code as string,
    status: row.status as QuotationStatus,
    amount: Number(row.total_amount || 0),
    issueDate: row.issue_date as string,
    customerName: partyName(row.customer),
  }));

  const byStatus: StatusBreakdownRow[] = QUOTATION_STATUSES.map((status) => {
    const matching = rows.filter((r) => r.status === status);
    return {
      status,
      label: QUOTATION_STATUS_LABELS[status],
      count: matching.length,
      amount: matching.reduce((sum, r) => sum + r.amount, 0),
    };
  });

  const accepted = rows.filter((r) => r.status === 'ACCEPTED');
  const decided = rows.filter((r) => r.status === 'ACCEPTED' || r.status === 'REJECTED' || r.status === 'EXPIRED');
  const open = rows.filter((r) => r.status === 'DRAFT' || r.status === 'SENT');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const oldestOpen: OpenQuotationRow[] = open
    .slice()
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
    .slice(0, 8)
    .map((r) => {
      const issued = new Date(`${r.issueDate}T00:00:00`);
      const daysOpen = Math.max(0, Math.floor((today.getTime() - issued.getTime()) / 86400000));
      return { id: r.id, code: r.code, customerName: r.customerName, issueDate: r.issueDate, daysOpen, amount: r.amount };
    });

  return {
    totalCount: rows.length,
    totalAmount: rows.reduce((sum, r) => sum + r.amount, 0),
    acceptedCount: accepted.length,
    acceptedAmount: accepted.reduce((sum, r) => sum + r.amount, 0),
    acceptanceRate: decided.length ? Math.round((accepted.length / decided.length) * 100) : 0,
    openCount: open.length,
    openAmount: open.reduce((sum, r) => sum + r.amount, 0),
    byStatus,
    oldestOpen,
  };
}

// ---------- Ventas y facturación ----------

export type MonthlyRevenueRow = { month: string; label: string; count: number; amount: number };
export type CustomerRevenueRow = { customerId: number | null; customerName: string; count: number; amount: number };

export type SalesReport = {
  invoiceCount: number;
  totalAmount: number;
  cancelledCount: number;
  averageTicket: number;
  byMonth: MonthlyRevenueRow[];
  topCustomers: CustomerRevenueRow[];
};

const MONTH_LABEL = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' });

export async function getSalesReport(range: DateRange): Promise<SalesReport> {
  const c = client();
  const cid = await companyId();
  const { data, error } = await c
    .from('invoice')
    .select('id,status,issue_date,total_amount,customer_id,customer:customer_id(party:party_id(legal_name,trade_name))')
    .eq('company_id', cid)
    .gte('issue_date', range.from)
    .lte('issue_date', range.to);
  if (error) throw new CoreRepositoryError(error.message);

  const rows = (data ?? []).map((row: any) => ({
    id: Number(row.id),
    status: row.status as string,
    amount: Number(row.total_amount || 0),
    issueDate: row.issue_date as string,
    customerId: row.customer_id == null ? null : Number(row.customer_id),
    customerName: partyName(row.customer),
  }));

  const valid = rows.filter((r) => r.status !== 'CANCELLED');

  const monthMap = new Map<string, { count: number; amount: number }>();
  for (const r of valid) {
    const month = r.issueDate.slice(0, 7);
    const entry = monthMap.get(month) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += r.amount;
    monthMap.set(month, entry);
  }
  const byMonth: MonthlyRevenueRow[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      label: MONTH_LABEL.format(new Date(`${month}-01T00:00:00`)),
      count: v.count,
      amount: v.amount,
    }));

  const customerMap = new Map<string, { customerId: number | null; customerName: string; count: number; amount: number }>();
  for (const r of valid) {
    const key = r.customerId != null ? String(r.customerId) : r.customerName;
    const entry = customerMap.get(key) ?? { customerId: r.customerId, customerName: r.customerName, count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += r.amount;
    customerMap.set(key, entry);
  }
  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  return {
    invoiceCount: valid.length,
    totalAmount: valid.reduce((sum, r) => sum + r.amount, 0),
    cancelledCount: rows.length - valid.length,
    averageTicket: valid.length ? valid.reduce((sum, r) => sum + r.amount, 0) / valid.length : 0,
    byMonth,
    topCustomers,
  };
}

// ---------- Cobros pendientes (aging) ----------

export type AgingBucketKey = 'overdue' | 'due7' | 'due30' | 'later';

export type AgingBucketRow = { key: AgingBucketKey; label: string; count: number; amount: number };

export type CollectionsAgingReport = {
  pendingCount: number;
  pendingTotal: number;
  overdueCount: number;
  overdueTotal: number;
  buckets: AgingBucketRow[];
};

const AGING_LABELS: Record<AgingBucketKey, string> = {
  overdue: 'Vencido',
  due7: 'Vence en 7 días',
  due30: 'Vence en 8-30 días',
  later: 'Más adelante',
};

function agingBucket(dueDate: string, today: Date): AgingBucketKey {
  const due = new Date(`${dueDate}T00:00:00`);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 7) return 'due7';
  if (diffDays <= 30) return 'due30';
  return 'later';
}

export async function getCollectionsAgingReport(): Promise<CollectionsAgingReport> {
  const c = client();
  const { data, error } = await c.from('invoice_installment').select('amount,due_date').eq('status', 'PENDING');
  if (error) throw new CoreRepositoryError(error.message);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = (data ?? []).map((row: any) => ({ amount: Number(row.amount || 0), dueDate: row.due_date as string }));

  const buckets: AgingBucketRow[] = (['overdue', 'due7', 'due30', 'later'] as AgingBucketKey[]).map((key) => {
    const matching = rows.filter((r) => agingBucket(r.dueDate, today) === key);
    return { key, label: AGING_LABELS[key], count: matching.length, amount: matching.reduce((sum, r) => sum + r.amount, 0) };
  });

  const overdue = buckets.find((b) => b.key === 'overdue')!;

  return {
    pendingCount: rows.length,
    pendingTotal: rows.reduce((sum, r) => sum + r.amount, 0),
    overdueCount: overdue.count,
    overdueTotal: overdue.amount,
    buckets,
  };
}
