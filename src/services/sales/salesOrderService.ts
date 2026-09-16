import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { sanitizeSearchTerm } from '../core/searchSanitize';
import { createSalesOrderComment, type SalesOrderComment } from './salesOrderCommentService';

export type SalesOrderStatus = 'PENDING_MANUFACTURING' | 'PREPARED' | 'FABRICATING' | 'CONFECTIONED' | 'MANUFACTURED' | 'INSTALLATION_SCHEDULED' | 'INSTALLED' | 'INVOICED' | 'CANCELLED' | 'BLOCKED';

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
  created_at?: string;
  created_by?: string | null;
  installation_latitude: number | null;
  installation_longitude: number | null;
  zone_id: number | null;
  requires_installation: boolean;
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
    'id,code,issue_date,valid_until,status,reference,notes,measurement_id,customer_id,contact_name,contact_email,contact_phone,net_amount,discount_amount,tax_amount,total_amount,customer:customer_id(id,party:party_id(legal_name,trade_name)),contact:contact_id(id,first_name,last_name,email,phone,mobile),lines:quotation_line(id,line_no,description,quantity,unit_price,discount_percent,tax_percent,net_amount,tax_amount,total_amount,specific_data,product:product_id(id,code,commercial_description,technical_description),dimensions:quotation_line_dimension(code,name,value,unit_id,unit:unit_id(code,symbol)),characteristics:quotation_line_characteristic(attribute_id,color_id,attribute:product_attribute(code,name),color:color(code,name,hex)))'
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

export async function listSalesOrdersByQuotationId(quotationId: number): Promise<SalesOrder[]> {
  const c = client();
  const cid = await companyId();
  const { data, error } = await c.from('sales_order')
    .select('id,code,status,issue_date,total_amount')
    .eq('company_id', cid).eq('quotation_id', quotationId).order('issue_date', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  return (data || []) as SalesOrder[];
}

export type QuotationLineConversion = {
  quotation_line_id: number;
  line_no: number;
  quantity: number;
  converted_quantity: number;
  remaining_quantity: number;
};

export async function getQuotationConversionStatus(quotationId: number): Promise<QuotationLineConversion[]> {
  const c = client();
  const { data, error } = await c.rpc('quotation_conversion_status', { p_quotation_id: quotationId });
  if (error) throw new CoreRepositoryError(error.message);
  return (data || []).map((row: any) => ({
    quotation_line_id: Number(row.quotation_line_id),
    line_no: Number(row.line_no),
    quantity: Number(row.quantity),
    converted_quantity: Number(row.converted_quantity),
    remaining_quantity: Number(row.remaining_quantity),
  }));
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

export type SalesOrderSortField = 'created_at' | 'requested_delivery_date';

export async function listSalesOrders(search = '', sortBy: SalesOrderSortField = 'created_at', ascending = false): Promise<SalesOrder[]> {
  const c = client();
  const cid = await companyId();
  let q = c.from('sales_order')
    .select('id,code,quotation_id,customer_id,issue_date,requested_delivery_date,status,reference,notes,total_amount,created_at,installation_latitude,installation_longitude,zone_id,requires_installation,quotation:quotation_id(code),customer:customer_id(party:party_id(legal_name,trade_name)),lines:sales_order_line(id,line_no,description,quantity,product_id,specific_data)')
    .eq('company_id', cid)
    .order(sortBy, { ascending, nullsFirst: false })
    .order('id', { ascending: false });
  const term = sanitizeSearchTerm(search);
  if (term) q = q.or(`code.ilike.%${term}%,reference.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data || []).map((row: any) => {
    const customer = mapPartyCustomer(row.customer);
    const quotation = one(row.quotation);
    const lines = (row.lines || []).sort((a: any, b: any) => (a.line_no ?? 0) - (b.line_no ?? 0));
    return { ...row, quotation_code: quotation?.code, customer_name: customer.name, lines } as SalesOrder;
  });
}

export function isOrderBlocked(order: { status: string; notes?: string | null }): boolean {
  return order.status === 'BLOCKED' || Boolean(order.notes && order.notes.includes('[BLOQUEADO'));
}

export function getOrderBlockReason(order: { notes?: string | null }, comments?: SalesOrderComment[]): string | null {
  if (order.notes) {
    const match = order.notes.match(/\[BLOQUEADO(?::\s*([^\]]+))?\]/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  if (comments && comments.length > 0) {
    const blockComment = [...comments].reverse().find(c => c.text.includes('[BLOQUEO') || c.text.includes('[BLOQUEADO'));
    if (blockComment) {
      return blockComment.text.replace(/\[BLOQUEO[^\]]*\]\s*/i, '').trim();
    }
  }
  return null;
}

export async function blockSalesOrder(
  id: number,
  reason: string,
): Promise<{ success: boolean; reason: string }> {
  const c = client();
  const cid = await companyId();
  const trimmedReason = reason.trim();
  const tag = `[BLOQUEADO: ${trimmedReason}]`;
  
  const current = await getSalesOrder(id);
  const existingNotes = current?.notes || '';
  const newNotes = existingNotes ? `${existingNotes}\n${tag}` : tag;

  // Try updating status to 'BLOCKED'
  const { error: statusError } = await c.from('sales_order').update({
    status: 'BLOCKED',
    notes: newNotes,
    updated_at: new Date().toISOString(),
  }).eq('company_id', cid).eq('id', id);

  if (statusError) {
    // If status check constraint fails in database, update notes with tag
    const { error: noteError } = await c.from('sales_order').update({
      notes: newNotes,
      updated_at: new Date().toISOString(),
    }).eq('company_id', cid).eq('id', id);
    if (noteError) throw new CoreRepositoryError(noteError.message);
  }

  // Audit trail comment
  try {
    await createSalesOrderComment(id, `[BLOQUEO DE FABRICACIÓN] ${trimmedReason}`, false);
  } catch {
    // Non-blocking
  }

  return { success: true, reason: trimmedReason };
}

export async function unblockSalesOrder(
  id: number,
  unblockNote?: string,
  targetStatus: SalesOrderStatus = 'PENDING_MANUFACTURING'
): Promise<void> {
  const c = client();
  const cid = await companyId();
  const current = await getSalesOrder(id);
  
  // Clean up any [BLOQUEADO...] tags from notes
  const newNotes = (current?.notes || '').replace(/\[BLOQUEADO(?::\s*[^\]]+)?\]\s*\n?/g, '').trim() || null;
  
  const updatePayload: any = {
    notes: newNotes,
    updated_at: new Date().toISOString(),
  };

  if (current?.status === 'BLOCKED') {
    updatePayload.status = targetStatus;
  }

  const { error } = await c.from('sales_order').update(updatePayload).eq('company_id', cid).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);

  // Audit trail comment
  try {
    const text = unblockNote?.trim() ? `[DESBLOQUEO DE FABRICACIÓN] ${unblockNote.trim()}` : '[DESBLOQUEO DE FABRICACIÓN] Desbloqueado';
    await createSalesOrderComment(id, text, false);
  } catch {
    // Non-blocking
  }
}

export async function createSalesOrderFromQuotation(
  quotationId: number,
  lines: { quotationLineId: number; quantity: number }[],
  requiresInstallation: boolean,
): Promise<SalesOrder> {
  const c = client();
  const { data, error } = await c.rpc('create_sales_order_from_quotation', {
    p_quotation_id: quotationId,
    p_lines: lines.map((l) => ({ quotation_line_id: l.quotationLineId, quantity: l.quantity })),
    p_requires_installation: requiresInstallation,
  });
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

export async function updateSalesOrderLocation(id: number, values: { installation_latitude?: number | null; installation_longitude?: number | null; zone_id?: number | null }): Promise<void> {
  const c = client();
  const cid = await companyId();
  const { error } = await c.from('sales_order').update({
    ...(values.installation_latitude !== undefined ? { installation_latitude: values.installation_latitude } : {}),
    ...(values.installation_longitude !== undefined ? { installation_longitude: values.installation_longitude } : {}),
    ...(values.zone_id !== undefined ? { zone_id: values.zone_id } : {}),
    updated_at: new Date().toISOString(),
  }).eq('company_id', cid).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}
