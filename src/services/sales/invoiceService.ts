import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type InvoiceStatus = 'ISSUED' | 'RECTIFIED';
export type InvoiceType = 'ORIGINAL' | 'RECTIFICATIVA';
export type VerifactuStatus = 'NOT_SENT' | 'PENDING' | 'SENT' | 'ERROR';

export type InstallmentStatus = 'PENDING' | 'COLLECTED';

export type InvoiceInstallment = {
  id: number;
  sequence: number;
  percentage: number;
  due_date: string;
  amount: number;
  status: InstallmentStatus;
  collected_amount: number | null;
  collected_date: string | null;
  collected_notes: string | null;
};

export type InvoiceTaxBreakdown = {
  tax_percent: number;
  base_amount: number;
  tax_amount: number;
};

export type InvoiceLine = {
  id: number;
  line_no: number;
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  net_amount: number;
  tax_amount: number;
  total_amount: number;
};

export type Invoice = {
  id: number;
  code: string;
  sales_order_id: number;
  sales_order_code?: string;
  customer_id: number;
  customer_name?: string;
  issue_date: string;
  status: InvoiceStatus;
  reference: string | null;
  notes: string | null;
  payment_method_id: number | null;
  payment_method_name?: string | null;
  payment_term_id: number | null;
  payment_term_name?: string | null;
  billing_address_street: string | null;
  billing_address_city: string | null;
  billing_address_postal_code: string | null;
  billing_address_region: string | null;
  net_amount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  series: string;
  invoice_type: InvoiceType;
  rectifies_invoice_id: number | null;
  rectified_by_invoice_id: number | null;
  rectification_reason: string | null;
  issuer_tax_id: string | null;
  issuer_legal_name: string | null;
  issuer_address: string | null;
  customer_tax_id: string | null;
  chain_sequence: number | null;
  record_hash: string | null;
  hash_algorithm: string;
  verifactu_status: VerifactuStatus;
  lines?: InvoiceLine[];
  installments?: InvoiceInstallment[];
  tax_breakdown?: InvoiceTaxBreakdown[];
};

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

function mapPartyCustomer(value: any): string | undefined {
  const customer = one(value);
  const party = one(customer?.party);
  return party?.trade_name || party?.legal_name || undefined;
}

const LIST_SELECT =
  'id,code,sales_order_id,customer_id,issue_date,status,invoice_type,reference,total_amount,sales_order:sales_order_id(code),customer:customer_id(party:party_id(legal_name,trade_name))';

export async function listInvoices(search = ''): Promise<Invoice[]> {
  const c = client();
  const cid = await companyId();
  let q = c.from('invoice').select(LIST_SELECT).eq('company_id', cid).order('issue_date', { ascending: false }).order('id', { ascending: false });
  const term = search.trim().replace(/[%_]/g, '');
  if (term) q = q.or(`code.ilike.%${term}%,reference.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data || []).map((row: any) => ({
    ...row,
    sales_order_code: one(row.sales_order)?.code,
    customer_name: mapPartyCustomer(row.customer),
  })) as Invoice[];
}

const DETAIL_SELECT =
  'id,code,sales_order_id,customer_id,issue_date,status,reference,notes,payment_method_id,payment_term_id,billing_address_street,billing_address_city,billing_address_postal_code,billing_address_region,net_amount,discount_amount,tax_amount,total_amount,' +
  'series,invoice_type,rectifies_invoice_id,rectified_by_invoice_id,rectification_reason,issuer_tax_id,issuer_legal_name,issuer_address,customer_tax_id,chain_sequence,record_hash,hash_algorithm,verifactu_status,' +
  'sales_order:sales_order_id(code),customer:customer_id(party:party_id(legal_name,trade_name)),' +
  'payment_method:payment_method_id(name),payment_term:payment_term_id(name),' +
  'lines:invoice_line(id,line_no,product_id,description,quantity,unit_price,discount_percent,tax_percent,net_amount,tax_amount,total_amount),' +
  'installments:invoice_installment(id,sequence,percentage,due_date,amount,status,collected_amount,collected_date,collected_notes),' +
  'tax_breakdown:invoice_tax_breakdown(tax_percent,base_amount,tax_amount)';

export async function getInvoice(id: number): Promise<Invoice | null> {
  const c = client();
  const cid = await companyId();
  const { data, error } = await c.from('invoice').select(DETAIL_SELECT).eq('company_id', cid).eq('id', id).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  if (!data) return null;
  const row = data as any;
  return {
    ...row,
    sales_order_code: one(row.sales_order)?.code,
    customer_name: mapPartyCustomer(row.customer),
    payment_method_name: one(row.payment_method)?.name ?? null,
    payment_term_name: one(row.payment_term)?.name ?? null,
    lines: (row.lines || []).sort((a: any, b: any) => a.line_no - b.line_no),
    installments: (row.installments || []).sort((a: any, b: any) => a.sequence - b.sequence),
    tax_breakdown: row.tax_breakdown || [],
  } as Invoice;
}

export async function getInvoiceBySalesOrderId(salesOrderId: number): Promise<Invoice | null> {
  const c = client();
  const cid = await companyId();
  const { data, error } = await c.from('invoice').select(LIST_SELECT).eq('company_id', cid).eq('sales_order_id', salesOrderId).eq('status', 'ISSUED').eq('invoice_type', 'ORIGINAL').order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  if (!data) return null;
  const row = data as any;
  return { ...row, sales_order_code: one(row.sales_order)?.code, customer_name: mapPartyCustomer(row.customer) } as Invoice;
}

export async function createInvoiceFromSalesOrder(salesOrderId: number): Promise<Invoice> {
  const c = client();
  const { data, error } = await c.rpc('create_invoice_from_sales_order', { p_sales_order_id: salesOrderId });
  if (error) throw new CoreRepositoryError(error.message);
  const invoice = await getInvoice(Number(data));
  if (!invoice) throw new CoreRepositoryError('La factura se ha creado pero no se ha podido recuperar.');
  return invoice;
}

export async function createRectifyingInvoice(id: number, reason: string): Promise<Invoice> {
  const c = client();
  const { data, error } = await c.rpc('create_rectifying_invoice', { p_invoice_id: id, p_reason: reason });
  if (error) throw new CoreRepositoryError(error.message);
  const invoice = await getInvoice(Number(data));
  if (!invoice) throw new CoreRepositoryError('La factura rectificativa se ha creado pero no se ha podido recuperar.');
  return invoice;
}

export async function markInstallmentCollected(installmentId: number, values: { collected_amount: number; collected_date: string; collected_notes: string | null }): Promise<void> {
  const c = client();
  const { error } = await c.from('invoice_installment').update({
    status: 'COLLECTED',
    collected_amount: values.collected_amount,
    collected_date: values.collected_date,
    collected_notes: values.collected_notes?.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('id', installmentId);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function markInstallmentPending(installmentId: number): Promise<void> {
  const c = client();
  const { error } = await c.from('invoice_installment').update({
    status: 'PENDING',
    collected_amount: null,
    collected_date: null,
    collected_notes: null,
    updated_at: new Date().toISOString(),
  }).eq('id', installmentId);
  if (error) throw new CoreRepositoryError(error.message);
}
