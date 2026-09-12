import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { getCurrentCompanyId } from '../core/coreRepository';
import { listCollections, urgency } from './collectionService';
import { listDeliveryNotes } from './deliveryNoteService';

export type CustomerDocumentType = 'quotation' | 'sales_order' | 'delivery_note' | 'invoice';

export type CustomerDocumentRow = {
  type: CustomerDocumentType;
  id: number | string;
  code: string;
  date: string;
  status: string;
  statusLabel: string;
  amount: number;
  link: string;
};

export type CustomerPendingCollection = {
  id: number;
  invoiceId: number;
  invoiceCode: string;
  sequence: number;
  dueDate: string;
  amount: number;
  urgency: 'overdue' | 'soon' | null;
};

export type CustomerCommercialSummary = {
  documents: CustomerDocumentRow[];
  pendingCollections: CustomerPendingCollection[];
  stats: {
    quotationsCount: number;
    quotationsAcceptedCount: number;
    quotationsAcceptanceRate: number;
    quotationsTotalAmount: number;
    ordersCount: number;
    ordersTotalAmount: number;
    averageOrderAmount: number;
    invoicesCount: number;
    invoicesTotalAmount: number;
    lastActivityDate: string | null;
    pendingCollectionsAmount: number;
    overdueCollectionsCount: number;
    overdueCollectionsAmount: number;
  };
};

const QUOTATION_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviado',
  ACCEPTED: 'Aceptado',
  CANCELLED: 'Cancelado',
  EXPIRED: 'Caducado',
};
const SALES_ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_MANUFACTURING: 'Pendiente de fabricación',
  PREPARED: 'Preparado',
  FABRICATING: 'Fabricando',
  CONFECTIONED: 'Confeccionado',
  MANUFACTURED: 'Fabricado',
  INSTALLATION_SCHEDULED: 'Montaje programado',
  INSTALLED: 'Instalado',
  CANCELLED: 'Cancelado',
};
const DELIVERY_NOTE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  PREPARED: 'Preparado',
  SHIPPED: 'Enviado',
  DELIVERED: 'Entregado',
};
const INVOICE_STATUS_LABEL: Record<string, string> = {
  ISSUED: 'Emitida',
  RECTIFIED: 'Rectificada',
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

async function fetchQuotationDocuments(companyId: number, customerId: number): Promise<CustomerDocumentRow[]> {
  const c = client();
  const { data, error } = await c
    .from('quotation')
    .select('id,code,issue_date,status,total_amount')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .order('issue_date', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map((q: any) => ({
    type: 'quotation' as const,
    id: Number(q.id),
    code: q.code,
    date: q.issue_date,
    status: q.status,
    statusLabel: QUOTATION_STATUS_LABEL[q.status] ?? q.status,
    amount: Number(q.total_amount || 0),
    link: `/ventas/presupuestos/${q.id}`,
  }));
}

async function fetchSalesOrderDocuments(companyId: number, customerId: number): Promise<CustomerDocumentRow[]> {
  const c = client();
  const { data, error } = await c
    .from('sales_order')
    .select('id,code,issue_date,status,total_amount')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .order('issue_date', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map((o: any) => ({
    type: 'sales_order' as const,
    id: Number(o.id),
    code: o.code,
    date: o.issue_date,
    status: o.status,
    statusLabel: SALES_ORDER_STATUS_LABEL[o.status] ?? o.status,
    amount: Number(o.total_amount || 0),
    link: `/ventas/pedidos/${o.id}`,
  }));
}

async function fetchInvoiceDocuments(companyId: number, customerId: number): Promise<CustomerDocumentRow[]> {
  const c = client();
  const { data, error } = await c
    .from('invoice')
    .select('id,code,issue_date,status,total_amount')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .order('issue_date', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map((i: any) => ({
    type: 'invoice' as const,
    id: Number(i.id),
    code: i.code,
    date: i.issue_date,
    status: i.status,
    statusLabel: INVOICE_STATUS_LABEL[i.status] ?? i.status,
    amount: Number(i.total_amount || 0),
    link: `/facturacion/facturas/${i.id}`,
  }));
}

async function fetchDeliveryNoteDocuments(customerId: number): Promise<CustomerDocumentRow[]> {
  const notes = await listDeliveryNotes();
  return notes
    .filter((d) => d.customer_id === customerId)
    .map((d) => ({
      type: 'delivery_note' as const,
      id: d.id,
      code: d.code,
      date: d.issue_date,
      status: d.status,
      statusLabel: DELIVERY_NOTE_STATUS_LABEL[d.status] ?? d.status,
      amount: Number(d.total_amount || 0),
      link: `/facturacion/albaranes?open=${d.id}`,
    }));
}

export async function getCustomerCommercialSummary(customerId: number): Promise<CustomerCommercialSummary> {
  const companyId = await getCurrentCompanyId();
  const [quotations, orders, invoices, collections, deliveryNotes] = await Promise.all([
    fetchQuotationDocuments(companyId, customerId),
    fetchSalesOrderDocuments(companyId, customerId),
    fetchInvoiceDocuments(companyId, customerId),
    listCollections({ status: 'ALL', customerId }),
    fetchDeliveryNoteDocuments(customerId),
  ]);

  const documents = [...quotations, ...orders, ...deliveryNotes, ...invoices].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const pendingCollections: CustomerPendingCollection[] = collections
    .filter((c) => c.status === 'PENDING')
    .map((c) => ({
      id: c.id,
      invoiceId: c.invoiceId,
      invoiceCode: c.invoiceCode,
      sequence: c.sequence,
      dueDate: c.dueDate,
      amount: c.amount,
      urgency: urgency(c),
    }))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

  const quotationsAccepted = quotations.filter((q) => q.status === 'ACCEPTED');
  const quotationsRelevant = quotations.filter((q) => q.status !== 'CANCELLED');
  const ordersRelevant = orders.filter((o) => o.status !== 'CANCELLED');
  const ordersTotalAmount = ordersRelevant.reduce((sum, o) => sum + o.amount, 0);
  const invoicesTotalAmount = invoices.reduce((sum, i) => sum + i.amount, 0);
  const pendingCollectionsAmount = pendingCollections.reduce((sum, c) => sum + c.amount, 0);
  const overdue = pendingCollections.filter((c) => c.urgency === 'overdue');
  const lastActivityDate = documents[0]?.date ?? null;

  return {
    documents,
    pendingCollections,
    stats: {
      quotationsCount: quotationsRelevant.length,
      quotationsAcceptedCount: quotationsAccepted.length,
      quotationsAcceptanceRate: quotationsRelevant.length ? Math.round((quotationsAccepted.length / quotationsRelevant.length) * 100) : 0,
      quotationsTotalAmount: quotationsRelevant.reduce((sum, q) => sum + q.amount, 0),
      ordersCount: ordersRelevant.length,
      ordersTotalAmount,
      averageOrderAmount: ordersRelevant.length ? ordersTotalAmount / ordersRelevant.length : 0,
      invoicesCount: invoices.length,
      invoicesTotalAmount,
      lastActivityDate,
      pendingCollectionsAmount,
      overdueCollectionsCount: overdue.length,
      overdueCollectionsAmount: overdue.reduce((sum, c) => sum + c.amount, 0),
    },
  };
}
