import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type SalesOrderStatus = 'PENDING_MANUFACTURING' | 'PREPARED' | 'FABRICATING' | 'CONFECTIONED' | 'MANUFACTURED' | 'INSTALLED' | 'CANCELLED';

export type SalesOrder = {
  id: number;
  code: string;
  quotation_id: number;
  quotation_code?: string;
  customer_id: number;
  customer_name?: string;
  issue_date: string;
  requested_delivery_date: string | null;
  status: SalesOrderStatus;
  reference: string | null;
  notes: string | null;
  net_amount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  measurement_id: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  lines?: any[];
};

export type SalesOrderDraft = {
  id: number;
  code: string;
  issue_date: string;
  valid_until: string | null;
  status: string;
  reference: string | null;
  notes: string | null;
  measurement_id: number | null;
  customer_id: number | null;
  customer_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  requested_delivery_date: string | null;
  net_amount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  lines: any[];
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

function mapPartyCustomer(value: any): { name?: string; raw: any } {
  const customer = one(value);
  const party = one(customer?.party);
  return { name: party?.trade_name || party?.legal_name, raw: customer };
}

export async function getQuotationForSalesOrderDraft(quotationId: number): Promise<SalesOrderDraft> {
  const c = client();
  const cid = await companyId();
  const { data, error } = await c.from('quotation').select(
    'id,code,issue_date,valid_until,status,reference,notes,measurement_id,customer_id,contact_name,contact_email,contact_phone,net_amount,discount_amount,tax_amount,total_amount,customer:customer_id(id,party:party_id(legal_name,trade_name)),contact:contact_id(id,first_name,last_name,email,phone,mobile),lines:quotation_line(id,line_no,description,quantity,unit_price,discount_percent,tax_percent,net_amount,tax_amount,total_amount,specific_data,product:product_id(id,code,commercial_description,technical_description))'
  ).eq('company_id', cid).eq('id', quotationId).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  if (!data) throw new CoreRepositoryError('Presupuesto no encontrado.');
  if (data.status !== 'ACCEPTED') throw new CoreRepositoryError('Solo se puede crear un pedido desde un presupuesto aceptado.');
  if (data.customer_id == null) throw new CoreRepositoryError('El presupuesto debe tener un cliente antes de crear el pedido.');

  const contact = one((data as any).contact);
  const contactName = data.contact_name || (contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : null);
  const contactEmail = data.contact_email || contact?.email || null;
  const contactPhone = data.contact_phone || contact?.phone || contact?.mobile || null;
  const customer = mapPartyCustomer((data as any).customer);

  return {
    ...data,
    customer_name: customer.name || null,
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    requested_delivery_date: null,
    lines: (data.lines || []).sort((a: any, b: any) => a.line_no - b.line_no),
  } as unknown as SalesOrderDraft;
}

export async function getSalesOrderByQuotationId(quotationId: number): Promise<SalesOrder | null> {
  const c = client();
  const cid = await companyId();
  const { data, error } = await c.from('sales_order')
    .select('*,quotation:quotation_id(code),customer:customer_id(party:party_id(legal_name,trade_name)),lines:sales_order_line(*)')
    .eq('company_id', cid).eq('quotation_id', quotationId).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  if (!data) return null;
  const customer = mapPartyCustomer((data as any).customer);
  const quotation = one((data as any).quotation);
  return { ...data, quotation_code: quotation?.code, customer_name: customer.name, lines: (data.lines || []).sort((a: any, b: any) => a.line_no - b.line_no) } as SalesOrder;
}

export async function getSalesOrder(id: number): Promise<SalesOrder | null> {
  const c = client();
  const cid = await companyId();
  const { data, error } = await c.from('sales_order')
    .select('*,quotation:quotation_id(code),customer:customer_id(party:party_id(legal_name,trade_name)),lines:sales_order_line(*)')
    .eq('company_id', cid).eq('id', id).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  if (!data) return null;
  const customer = mapPartyCustomer((data as any).customer);
  const quotation = one((data as any).quotation);
  return { ...data, quotation_code: quotation?.code, customer_name: customer.name, lines: (data.lines || []).sort((a: any, b: any) => a.line_no - b.line_no) } as SalesOrder;
}

export async function listSalesOrders(search = ''): Promise<SalesOrder[]> {
  const c = client();
  const cid = await companyId();
  let q = c.from('sales_order').select('id,code,quotation_id,customer_id,issue_date,requested_delivery_date,status,reference,total_amount,quotation:quotation_id(code),customer:customer_id(party:party_id(legal_name,trade_name))').eq('company_id', cid).order('issue_date', { ascending: false }).order('id', { ascending: false });
  const term = search.trim().replace(/[%_]/g, '');
  if (term) q = q.or(`code.ilike.%${term}%,reference.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data || []).map((row: any) => {
    const customer = mapPartyCustomer(row.customer);
    const quotation = one(row.quotation);
    return { ...row, quotation_code: quotation?.code, customer_name: customer.name } as SalesOrder;
  });
}

export async function createSalesOrderFromQuotation(quotationId: number): Promise<SalesOrder> {
  const c = client();
  const { data, error } = await c.rpc('create_sales_order_from_quotation', { p_quotation_id: quotationId });
  if (error) throw new CoreRepositoryError(error.message);
  const order = await getSalesOrder(Number(data));
  if (!order) throw new CoreRepositoryError('El pedido se ha creado pero no se ha podido recuperar.');
  return order;
}

export async function updateSalesOrder(id: number, values: { requested_delivery_date: string | null; reference: string | null; notes: string | null }): Promise<void> {
  const c = client();
  const cid = await companyId();
  const { error } = await c.from('sales_order').update({
    requested_delivery_date: values.requested_delivery_date || null,
    reference: values.reference?.trim() || null,
    notes: values.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  }).eq('company_id', cid).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}
