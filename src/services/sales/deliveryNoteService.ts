import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { getCurrentCompanyId } from '../core/coreRepository';

export type DeliveryNoteStatus = 'PENDING' | 'PREPARED' | 'SHIPPED' | 'DELIVERED';

export type DeliveryNoteLine = {
  id: number;
  line_no: number;
  product_id: number | null;
  product_code: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  net_amount: number;
  total_amount: number;
  configuration_snapshot?: any;
};

export type DeliveryNote = {
  id: number;
  code: string;
  sales_order_id: number;
  sales_order_code: string;
  installation_id: number | null;
  customer_id: number;
  customer_name: string;
  customer_legal_name?: string;
  delivery_address: string;
  delivery_city?: string;
  delivery_postal_code?: string;
  delivery_region?: string;
  issue_date: string;
  delivery_date: string | null;
  carrier: string | null;
  tracking_number: string | null;
  status: DeliveryNoteStatus;
  notes: string | null;
  lines: DeliveryNoteLine[];
  net_amount: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const SELECT =
  'id,code,sales_order_id,installation_id,customer_id,issue_date,delivery_date,carrier,tracking_number,' +
  'delivery_address_street,delivery_address_city,delivery_address_postal_code,delivery_address_region,' +
  'status,notes,net_amount,tax_amount,total_amount,created_at,' +
  'sales_order:sales_order_id(code),' +
  'customer:customer_id(party:party_id(legal_name,trade_name)),' +
  'lines:delivery_note_line(id,line_no,product_id,description,quantity,unit_price,discount_percent,net_amount,total_amount,specific_data,product:product_id(code))';

function mapRow(row: any): DeliveryNote {
  const salesOrder = one(row.sales_order);
  const customer = one(row.customer);
  const customerParty = one(customer?.party);
  const lines: DeliveryNoteLine[] = (row.lines || [])
    .slice()
    .sort((a: any, b: any) => Number(a.line_no) - Number(b.line_no))
    .map((l: any) => {
      const product = one(l.product);
      return {
        id: Number(l.id),
        line_no: Number(l.line_no),
        product_id: l.product_id == null ? null : Number(l.product_id),
        product_code:
          product?.code ||
          (l.specific_data?.otd_snapshot?.otd_code ? `OTD · ${l.specific_data.otd_snapshot.otd_code}` : 'MANUAL'),
        description: l.description || 'Artículo',
        quantity: Number(l.quantity || 0),
        unit_price: Number(l.unit_price || 0),
        discount_percent: Number(l.discount_percent || 0),
        net_amount: Number(l.net_amount || 0),
        total_amount: Number(l.total_amount || 0),
        configuration_snapshot: l.specific_data?.configuration_snapshot || l.specific_data?.otd_snapshot || null,
      };
    });
  return {
    id: Number(row.id),
    code: row.code,
    sales_order_id: Number(row.sales_order_id),
    sales_order_code: salesOrder?.code || '',
    installation_id: row.installation_id == null ? null : Number(row.installation_id),
    customer_id: Number(row.customer_id),
    customer_name: customerParty?.trade_name || customerParty?.legal_name || 'Cliente',
    customer_legal_name: customerParty?.legal_name || '',
    delivery_address: row.delivery_address_street || 'Dirección principal',
    delivery_city: row.delivery_address_city || '',
    delivery_postal_code: row.delivery_address_postal_code || '',
    delivery_region: row.delivery_address_region || '',
    issue_date: row.issue_date,
    delivery_date: row.delivery_date,
    carrier: row.carrier,
    tracking_number: row.tracking_number,
    status: row.status,
    notes: row.notes,
    lines,
    net_amount: Number(row.net_amount || 0),
    tax_amount: Number(row.tax_amount || 0),
    total_amount: Number(row.total_amount || 0),
    created_at: row.created_at,
  };
}

export async function listDeliveryNotes(): Promise<DeliveryNote[]> {
  const c = client();
  const companyId = await getCurrentCompanyId();
  const { data, error } = await c
    .from('delivery_note')
    .select(SELECT)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('issue_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map(mapRow);
}

export async function getDeliveryNoteById(id: number): Promise<DeliveryNote | null> {
  const c = client();
  const { data, error } = await c.from('delivery_note').select(SELECT).eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  return data ? mapRow(data) : null;
}

/** Todos los albaranes de un pedido — puede haber varios (uno por visita de montaje o por entrega manual). */
export async function listDeliveryNotesBySalesOrderId(salesOrderId: number): Promise<DeliveryNote[]> {
  const c = client();
  const { data, error } = await c
    .from('delivery_note')
    .select(SELECT)
    .eq('sales_order_id', salesOrderId)
    .is('deleted_at', null)
    .order('id', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map(mapRow);
}

export type SalesOrderLineDeliveryStatus = {
  salesOrderLineId: number;
  lineNo: number;
  productId: number | null;
  isOtd: boolean;
  quantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
};

/** Cuánto queda pendiente de entregar de cada línea del pedido. */
export async function getSalesOrderDeliveryStatus(salesOrderId: number): Promise<SalesOrderLineDeliveryStatus[]> {
  const c = client();
  const { data, error } = await c.rpc('sales_order_delivery_status', { p_sales_order_id: salesOrderId });
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map((r: any) => ({
    salesOrderLineId: Number(r.sales_order_line_id),
    lineNo: Number(r.line_no),
    productId: r.product_id == null ? null : Number(r.product_id),
    isOtd: Boolean(r.is_otd),
    quantity: Number(r.quantity),
    deliveredQuantity: Number(r.delivered_quantity),
    remainingQuantity: Number(r.remaining_quantity),
  }));
}

/** Genera un albarán con exactamente las líneas y cantidades indicadas. */
export async function createDeliveryNoteForLines(
  salesOrderId: number,
  lines: { salesOrderLineId: number; quantity: number }[],
  options?: { installationId?: number | null; deliveryDate?: string; carrier?: string; trackingNumber?: string; notes?: string },
): Promise<DeliveryNote> {
  const c = client();
  const { data, error } = await c.rpc('create_delivery_note_for_lines', {
    p_sales_order_id: salesOrderId,
    p_installation_id: options?.installationId ?? null,
    p_lines: lines.map((l) => ({ sales_order_line_id: l.salesOrderLineId, quantity: l.quantity })),
    p_delivery_date: options?.deliveryDate ?? null,
    p_carrier: options?.carrier ?? null,
    p_tracking_number: options?.trackingNumber ?? null,
    p_notes: options?.notes ?? null,
  });
  if (error) throw new CoreRepositoryError(error.message);
  const note = await getDeliveryNoteById(Number(data));
  if (!note) throw new CoreRepositoryError('El albarán se ha creado pero no se ha podido recuperar.');
  return note;
}

/**
 * Entrega de golpe todo lo pendiente de artículos simples (no OTD) del pedido. Las
 * líneas OTD nunca se incluyen aquí: se entregan enteras desde el montaje que las
 * cubra, nunca con este atajo.
 */
export async function createDeliveryNoteForAllRemainingSimpleLines(salesOrderId: number, notes?: string): Promise<DeliveryNote> {
  const status = await getSalesOrderDeliveryStatus(salesOrderId);
  const lines = status
    .filter((s) => !s.isOtd && s.remainingQuantity > 0)
    .map((s) => ({ salesOrderLineId: s.salesOrderLineId, quantity: s.remainingQuantity }));
  if (!lines.length) throw new CoreRepositoryError('No hay artículos pendientes de entregar en este pedido.');
  return createDeliveryNoteForLines(salesOrderId, lines, { notes });
}

/** Entrega parcial (o total) de una línea de artículo simple concreta. */
export async function registerLineDelivery(salesOrderLineId: number, quantity: number, notes?: string): Promise<DeliveryNote> {
  const c = client();
  const { data, error } = await c.rpc('register_line_delivery', {
    p_sales_order_line_id: salesOrderLineId,
    p_quantity: quantity,
    p_notes: notes ?? null,
  });
  if (error) throw new CoreRepositoryError(error.message);
  const note = await getDeliveryNoteById(Number(data));
  if (!note) throw new CoreRepositoryError('El albarán se ha creado pero no se ha podido recuperar.');
  return note;
}

export async function updateDeliveryNoteStatus(id: number, status: DeliveryNoteStatus): Promise<void> {
  const c = client();
  const { error } = await c.from('delivery_note').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}
