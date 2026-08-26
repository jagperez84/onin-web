export type DeliveryNoteLine = {
  id: string;
  line_no: number;
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
  id: string;
  code: string;
  quotation_id: number;
  quotation_code: string;
  customer_id: number;
  customer_name: string;
  customer_legal_name?: string;
  delivery_address: string;
  delivery_city?: string;
  delivery_postal_code?: string;
  delivery_region?: string;
  warehouse_name?: string;
  commercial_name?: string;
  issue_date: string;
  delivery_date: string;
  carrier?: string;
  tracking_number?: string;
  status: 'PENDING' | 'PREPARED' | 'SHIPPED' | 'DELIVERED';
  notes?: string;
  lines: DeliveryNoteLine[];
  net_amount: number;
  tax_amount: number;
  total_amount: number;
  created_at: string;
};

const STORAGE_KEY = 'onin_sales_delivery_notes';

function loadStored(): DeliveryNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStored(items: DeliveryNote[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Error saving delivery notes', e);
  }
}

export function listDeliveryNotes(): DeliveryNote[] {
  return loadStored().sort((a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime());
}

export function getDeliveryNoteById(id: string): DeliveryNote | null {
  return loadStored().find(d => d.id === id) || null;
}

export function getDeliveryNoteByQuotationId(quotationId: number): DeliveryNote | null {
  return loadStored().find(d => d.quotation_id === quotationId) || null;
}

export function generateDeliveryNoteCode(year: number = new Date().getFullYear()): string {
  const all = loadStored();
  const yearPrefix = `ALB-${year}/`;
  const existingInYear = all
    .map(d => d.code)
    .filter(c => c.startsWith(yearPrefix))
    .map(c => parseInt(c.replace(yearPrefix, ''), 10))
    .filter(n => !isNaN(n));
  
  const nextNum = (existingInYear.length > 0 ? Math.max(...existingInYear) : 0) + 1;
  return `${yearPrefix}${String(nextNum).padStart(3, '0')}`;
}

export function createDeliveryNoteFromQuotation(quotation: any, customOptions?: {
  deliveryDate?: string;
  carrier?: string;
  trackingNumber?: string;
  notes?: string;
}): DeliveryNote {
  const existing = getDeliveryNoteByQuotationId(quotation.id);
  if (existing) {
    return existing;
  }

  const year = new Date().getFullYear();
  const code = generateDeliveryNoteCode(year);
  const today = new Date().toISOString().slice(0, 10);

  const customerName = quotation.customer?.party?.trade_name || quotation.customer?.party?.legal_name || 'Cliente';
  const customerLegalName = quotation.customer?.party?.legal_name || '';

  const address = quotation.installation_address_street
    ? `${quotation.installation_address_street} ${quotation.installation_address_city || ''}`
    : quotation.billing_address_street
    ? `${quotation.billing_address_street} ${quotation.billing_address_city || ''}`
    : 'Dirección principal';

  const lines: DeliveryNoteLine[] = (quotation.lines || []).map((l: any, i: number) => ({
    id: `line_${i + 1}`,
    line_no: l.line_no || i + 1,
    product_code: l.product?.code || (l.specific_data?.otd_snapshot?.otd_code ? `OTD · ${l.specific_data.otd_snapshot.otd_code}` : 'MANUAL'),
    description: l.description || l.product?.commercial_description || 'Artículo',
    quantity: Number(l.quantity || 1),
    unit_price: Number(l.unit_price || 0),
    discount_percent: Number(l.discount_percent || 0),
    net_amount: Number(l.net_amount || 0),
    total_amount: Number(l.total_amount || 0),
    configuration_snapshot: l.specific_data?.configuration_snapshot || l.specific_data?.otd_snapshot || null,
  }));

  const note: DeliveryNote = {
    id: `dn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    code,
    quotation_id: quotation.id,
    quotation_code: quotation.code,
    customer_id: quotation.customer?.id || quotation.customer_id || 0,
    customer_name: customerName,
    customer_legal_name: customerLegalName,
    delivery_address: address,
    delivery_city: quotation.installation_address_city || quotation.billing_address_city || '',
    delivery_postal_code: quotation.installation_address_postal_code || quotation.billing_address_postal_code || '',
    delivery_region: quotation.installation_address_region || quotation.billing_address_region || '',
    warehouse_name: quotation.warehouse?.name || 'Almacén Principal',
    commercial_name: quotation.commercial?.party?.trade_name || quotation.commercial?.party?.legal_name || 'Comercial',
    issue_date: today,
    delivery_date: customOptions?.deliveryDate || today,
    carrier: customOptions?.carrier || 'Transporte propio',
    tracking_number: customOptions?.trackingNumber || '',
    status: 'PREPARED',
    notes: customOptions?.notes || quotation.notes || '',
    lines,
    net_amount: Number(quotation.net_amount || 0),
    tax_amount: Number(quotation.tax_amount || 0),
    total_amount: Number(quotation.total_amount || 0),
    created_at: new Date().toISOString(),
  };

  const current = loadStored();
  current.push(note);
  saveStored(current);

  return note;
}

export function updateDeliveryNoteStatus(id: string, status: DeliveryNote['status']): DeliveryNote | null {
  const all = loadStored();
  const idx = all.findIndex(d => d.id === id);
  if (idx === -1) return null;
  all[idx].status = status;
  saveStored(all);
  return all[idx];
}
