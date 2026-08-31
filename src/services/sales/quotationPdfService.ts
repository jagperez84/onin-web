import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface CompanyPdfDTO {
  name: string;
  tax_id: string | null;
  code?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  region?: string | null;
}

export interface CustomerPdfDTO {
  id?: number | null;
  code?: string | null;
  name: string;
  trade_name?: string | null;
  legal_name?: string | null;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  billing_address?: {
    street?: string | null;
    postal_code?: string | null;
    city?: string | null;
    region?: string | null;
  };
  installation_address?: {
    street?: string | null;
    postal_code?: string | null;
    city?: string | null;
    region?: string | null;
  };
}

export interface QuotationLinePdfDTO {
  line_no: number;
  product_code?: string | null;
  description: string;
  additional_description?: string | null;
  characteristics_text?: string | null;
  dimensions_text?: string | null;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  net_amount: number;
  tax_amount: number;
  total_amount: number;
  public_comments: string[];
}

export interface QuotationPdfDTO {
  id: number;
  code: string;
  issue_date: string;
  valid_until: string | null;
  status: string;
  reference: string | null;
  public_comments: string[];
  commercial_name?: string | null;
  warehouse_name?: string | null;
  payment_method_name?: string | null;
  payment_term_name?: string | null;
  company: CompanyPdfDTO;
  customer: CustomerPdfDTO;
  lines: QuotationLinePdfDTO[];
  totals: {
    base_amount: number;
    discount_amount: number;
    /** null cuando las líneas tienen tipos de impuesto distintos: no hay un único porcentaje que mostrar. */
    tax_percent: number | null;
    tax_amount: number;
    total_amount: number;
  };
}

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export const formatPdfMoney = (n: number | null | undefined): string => {
  const val = Number(n || 0);
  return val.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
};

export const formatPdfDate = (val: string | null | undefined): string => {
  if (!val) return '—';
  try {
    const cleanDate = val.includes('T') ? val.split('T')[0] : val;
    const [y, m, d] = cleanDate.split('-');
    if (y && m && d) return `${d}/${m}/${y}`;
    return new Date(val).toLocaleDateString('es-ES');
  } catch {
    return val;
  }
};

export const formatPdfPercent = (n: number | null | undefined): string => {
  const val = Number(n || 0);
  return `${val.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`;
};

export async function fetchQuotationPdfData(quotationId: number): Promise<QuotationPdfDTO> {
  const c = client();

  // 1. Get current authenticated user and company
  const { data: { user } } = await c.auth.getUser();
  let userCompanyId: number | null = null;
  if (user) {
    const { data: ua } = await c.from('user_account').select('company_id').eq('auth_user_id', user.id).maybeSingle();
    userCompanyId = ua?.company_id ? Number(ua.company_id) : null;
  }

  // 2. Fetch quotation header
  let q: any = null;
  const { data: qData, error: qErr } = await c
    .from('quotation')
    .select(`
      id, company_id, code, issue_date, valid_until, status, reference, notes,
      contact_id, contact_name, contact_email, contact_phone,
      net_amount, discount_amount, tax_amount, total_amount, tax_percent,
      billing_address_street, billing_address_city, billing_address_postal_code, billing_address_region,
      installation_address_street, installation_address_city, installation_address_postal_code, installation_address_region,
      customer:customer_id(id, party_id, party:party_id(id, code, legal_name, trade_name, tax_id, email, phone)),
      commercial:commercial_id(id, party:party_id(legal_name, trade_name)),
      warehouse:warehouse_id(id, code, name),
      payment_method:payment_method_id(id, code, name),
      payment_term:payment_term_id(id, code, name),
      lines:quotation_line(
        id, line_no, description, quantity, unit_price, discount_percent, tax_percent,
        net_amount, tax_amount, total_amount, specific_data,
        dimensions:quotation_line_dimension(code, name, value, unit_id, sort_order),
        characteristics:quotation_line_characteristic(attribute_id, attribute_value_id, value_text, value_number, value_boolean),
        product:product_id(
          id, code, commercial_description, technical_description, sales_price
        )
      )
    `)
    .eq('id', quotationId)
    .maybeSingle();

  if (qErr) {
    // Fallback if contact fields are missing in legacy DB schema
    const { data: qFallback, error: qErrFallback } = await c
      .from('quotation')
      .select(`
        id, company_id, code, issue_date, valid_until, status, reference, notes,
        net_amount, discount_amount, tax_amount, total_amount, tax_percent,
        billing_address_street, billing_address_city, billing_address_postal_code, billing_address_region,
        installation_address_street, installation_address_city, installation_address_postal_code, installation_address_region,
        customer:customer_id(id, party_id, party:party_id(id, code, legal_name, trade_name, tax_id, email, phone)),
        commercial:commercial_id(id, party:party_id(legal_name, trade_name)),
        warehouse:warehouse_id(id, code, name),
        payment_method:payment_method_id(id, code, name),
        payment_term:payment_term_id(id, code, name),
        lines:quotation_line(
          id, line_no, description, quantity, unit_price, discount_percent, tax_percent,
          net_amount, tax_amount, total_amount, specific_data,
          product:product_id(
            id, code, commercial_description, technical_description, sales_price
          )
        )
      `)
      .eq('id', quotationId)
      .maybeSingle();

    if (qErrFallback || !qFallback) throw new CoreRepositoryError(qErrFallback?.message || 'Presupuesto no encontrado.');
    q = qFallback;
  } else {
    q = qData;
  }

  if (!q) throw new CoreRepositoryError('Presupuesto no encontrado.');

  // 3. Fetch Company data
  const targetCompanyId = q.company_id || userCompanyId;
  let companyDto: CompanyPdfDTO = {
    name: 'Onin',
    tax_id: null,
  };

  if (targetCompanyId) {
    const { data: comp } = await c.from('company').select('id, code, name, tax_id').eq('id', targetCompanyId).maybeSingle();
    if (comp) {
      companyDto = {
        name: comp.name || 'Onin',
        tax_id: comp.tax_id || null,
        code: comp.code || null,
      };
    }
  }

  // 4. Extract Customer and Contact Data
  const party = q.customer?.party;
  const customerName = party?.trade_name || party?.legal_name || 'Cliente';
  const customerTaxId = party?.tax_id || null;
  const customerEmail = party?.email || null;
  const customerPhone = party?.phone || null;
  const customerCode = party?.code || (q.customer?.id ? `CLI-${String(q.customer.id).padStart(4, '0')}` : null);

  let pdfContactName = q.contact_name || null;
  let pdfContactEmail = q.contact_email || null;
  let pdfContactPhone = q.contact_phone || null;

  if (q.contact_id && (!pdfContactName || !pdfContactEmail || !pdfContactPhone)) {
    const { data: cData } = await c
      .from('contact')
      .select('id,first_name,last_name,email,phone,mobile')
      .eq('id', q.contact_id)
      .maybeSingle();

    if (cData) {
      if (!pdfContactName) pdfContactName = [cData.first_name, cData.last_name].filter(Boolean).join(' ') || null;
      if (!pdfContactEmail) pdfContactEmail = cData.email || null;
      if (!pdfContactPhone) pdfContactPhone = cData.phone || cData.mobile || null;
    }
  }

  const customerDto: CustomerPdfDTO = {
    id: q.customer?.id ? Number(q.customer.id) : null,
    code: customerCode,
    name: customerName,
    legal_name: party?.legal_name || null,
    trade_name: party?.trade_name || null,
    tax_id: customerTaxId,
    email: customerEmail,
    phone: customerPhone,
    contact_name: pdfContactName,
    contact_email: pdfContactEmail,
    contact_phone: pdfContactPhone,
    billing_address: {
      street: q.billing_address_street || null,
      postal_code: q.billing_address_postal_code || null,
      city: q.billing_address_city || null,
      region: q.billing_address_region || null,
    },
    installation_address: {
      street: q.installation_address_street || null,
      postal_code: q.installation_address_postal_code || null,
      city: q.installation_address_city || null,
      region: q.installation_address_region || null,
    },
  };

  // 5. Fetch units if needed for dimensions
  const { data: unitsData } = await c.from('unit').select('id, code, name');
  const unitMap = new Map<number, string>((unitsData || []).map((u: any) => [Number(u.id), u.code || u.name]));

  // Fetch attribute and attribute value names for characteristics
  const { data: attrData } = await c.from('product_attribute').select('id, name');
  const { data: attrValData } = await c.from('product_attribute_value').select('id, name');
  const attrMap = new Map<number, string>((attrData || []).map((a: any) => [Number(a.id), a.name]));
  const attrValMap = new Map<number, string>((attrValData || []).map((av: any) => [Number(av.id), av.name]));

  // 6. Process Lines
  const rawLines = (q.lines || []) as any[];
  rawLines.sort((a, b) => Number(a.line_no) - Number(b.line_no));

  // Comentarios: solo se imprimen los marcados como públicos, de cabecera o de cada línea.
  const { data: publicCommentRows } = await c
    .from('quotation_comment')
    .select('quotation_line_id,text')
    .eq('quotation_id', quotationId)
    .eq('is_public', true)
    .order('created_at');
  const headerPublicComments: string[] = [];
  const linePublicCommentsById = new Map<number, string[]>();
  for (const row of (publicCommentRows ?? []) as any[]) {
    if (row.quotation_line_id == null) {
      headerPublicComments.push(row.text);
    } else {
      const lineId = Number(row.quotation_line_id);
      const list = linePublicCommentsById.get(lineId) ?? [];
      list.push(row.text);
      linePublicCommentsById.set(lineId, list);
    }
  }

  const linesDto: QuotationLinePdfDTO[] = rawLines.map(line => {
    const p = line.product;
    const spec = line.specific_data || {};
    const otdSnapshot = spec.otd_snapshot;
    const configSnapshot = spec.configuration_snapshot;

    // Dimensions formatting: compact e.g. "500 x 300 cm" or from dimensions rows
    let dimensionsText: string | null = null;
    const dims = (line.dimensions || []) as any[];
    if (dims.length > 0) {
      dims.sort((a, b) => (Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0)));
      const validDims = dims.filter(d => d.value != null && Number(d.value) > 0);
      if (validDims.length > 0) {
        const unitLabel = validDims[0].unit_id ? (unitMap.get(Number(validDims[0].unit_id)) || '') : '';
        const valuesStr = validDims.map(d => `${d.value}`).join(' × ');
        dimensionsText = unitLabel ? `${valuesStr} ${unitLabel}` : valuesStr;
      }
    } else if (otdSnapshot?.dimensions?.length) {
      const validDims = otdSnapshot.dimensions.filter((d: any) => d.value != null && Number(d.value) > 0);
      if (validDims.length > 0) {
        const unit = validDims[0].unit_code || '';
        dimensionsText = `${validDims.map((d: any) => `${d.name ? d.name + ': ' : ''}${d.value}`).join(' × ')}${unit ? ` ${unit}` : ''}`;
      }
    } else if (configSnapshot?.dimensions?.length) {
      const validDims = configSnapshot.dimensions.filter((d: any) => d.value != null && Number(d.value) > 0);
      if (validDims.length > 0) {
        const unit = validDims[0].unit_code || '';
        dimensionsText = `${validDims.map((d: any) => d.value).join(' × ')}${unit ? ` ${unit}` : ''}`;
      }
    }

    // Characteristics formatting (e.g. "Color: Blanco", "Material: Acrílico")
    const charsList: string[] = [];
    const charRows = (line.characteristics || []) as any[];
    for (const ch of charRows) {
      const attrName = ch.attribute_id ? attrMap.get(Number(ch.attribute_id)) : null;
      let valStr: string | null = null;
      if (ch.attribute_value_id && attrValMap.has(Number(ch.attribute_value_id))) {
        valStr = attrValMap.get(Number(ch.attribute_value_id))!;
      } else if (ch.value_text) {
        valStr = ch.value_text;
      } else if (ch.value_number != null) {
        valStr = String(ch.value_number);
      } else if (ch.value_boolean != null) {
        valStr = ch.value_boolean ? 'Sí' : 'No';
      }

      if (valStr) {
        charsList.push(attrName ? `${attrName}: ${valStr}` : valStr);
      }
    }

    // Also check OTD / configuration snapshot for human-readable characteristics / variant
    if (otdSnapshot?.inputs_display?.length) {
      for (const inp of otdSnapshot.inputs_display) {
        if (inp.display_value && !charsList.some(c => c.includes(inp.name))) {
          charsList.push(`${inp.name}: ${inp.display_value}`);
        }
      }
    }

    const characteristicsText = charsList.length > 0 ? charsList.join(' · ') : null;

    const mainDescription = line.description?.trim() || p?.commercial_description || p?.technical_description || 'Partida';
    let additionalDesc: string | null = null;
    if (p?.technical_description && p.technical_description !== mainDescription && p.technical_description !== p.commercial_description) {
      additionalDesc = p.technical_description;
    }

    const qty = Number(line.quantity || 0);
    const unitPrice = Number(line.unit_price || 0);
    const discountPercent = Number(line.discount_percent || 0);
    const taxPercent = Number(line.tax_percent || 0);
    const net = Number(line.net_amount ?? (qty * unitPrice * (1 - discountPercent / 100)));
    const tax = Number(line.tax_amount ?? (net * taxPercent / 100));
    const total = Number(line.total_amount ?? (net + tax));

    return {
      line_no: Number(line.line_no),
      product_code: p?.code || (otdSnapshot?.otd_code ? `OTD-${otdSnapshot.otd_code}` : null),
      description: mainDescription,
      additional_description: additionalDesc,
      characteristics_text: characteristicsText,
      dimensions_text: dimensionsText,
      quantity: qty,
      unit_price: unitPrice,
      discount_percent: discountPercent,
      tax_percent: taxPercent,
      net_amount: net,
      tax_amount: tax,
      total_amount: total,
      public_comments: linePublicCommentsById.get(Number(line.id)) ?? [],
    };
  });

  // 7. Calculate economic summary
  const netTotal = linesDto.reduce((sum, l) => sum + l.net_amount, 0);
  const grossTotal = linesDto.reduce((sum, l) => sum + (l.quantity * l.unit_price), 0);
  const discountTotal = grossTotal - netTotal;
  const taxTotal = linesDto.reduce((sum, l) => sum + l.tax_amount, 0);
  const grandTotal = netTotal + taxTotal;
  // Cada línea puede llevar su propio tipo de impuesto: solo hay un porcentaje único que
  // mostrar en el resumen si todas las líneas coinciden.
  const distinctTaxPercents = [...new Set(linesDto.map(l => l.tax_percent))];
  const uniformTaxPercent = distinctTaxPercents.length === 1 ? distinctTaxPercents[0] : null;

  const commercialName = q.commercial?.party?.trade_name || q.commercial?.party?.legal_name || null;
  const warehouseName = q.warehouse ? (q.warehouse.code ? `${q.warehouse.code} · ${q.warehouse.name}` : q.warehouse.name) : null;
  const paymentMethodName = q.payment_method ? (q.payment_method.name || q.payment_method.code) : null;
  const paymentTermName = q.payment_term ? (q.payment_term.name || q.payment_term.code) : null;

  return {
    id: Number(q.id),
    code: q.code,
    issue_date: q.issue_date,
    valid_until: q.valid_until,
    status: q.status,
    reference: q.reference?.trim() || null,
    public_comments: headerPublicComments,
    commercial_name: commercialName,
    warehouse_name: warehouseName,
    payment_method_name: paymentMethodName,
    payment_term_name: paymentTermName,
    company: companyDto,
    customer: customerDto,
    lines: linesDto,
    totals: {
      base_amount: Number(q.net_amount ?? netTotal),
      discount_amount: Number(q.discount_amount ?? discountTotal),
      tax_percent: uniformTaxPercent,
      tax_amount: Number(q.tax_amount ?? taxTotal),
      total_amount: Number(q.total_amount ?? grandTotal),
    },
  };
}

export function buildQuotationPdf(dto: QuotationPdfDTO): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2); // 180 mm

  // Colors
  const primaryColor: [number, number, number] = [30, 41, 59]; // Slate 800
  const secondaryColor: [number, number, number] = [71, 85, 105]; // Slate 600
  const accentColor: [number, number, number] = [2, 132, 199]; // Sky 600
  const borderGray: [number, number, number] = [226, 232, 240]; // Slate 200
  const lightBg: [number, number, number] = [248, 250, 252]; // Slate 50

  let currentY = margin;

  // 1. Top Header Banner: Company and Document Identification
  // Left: Company Info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...primaryColor);
  doc.text(dto.company.name || 'ONIN', margin, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...secondaryColor);
  let companyY = currentY + 11;
  if (dto.company.tax_id) {
    doc.text(`NIF/CIF: ${dto.company.tax_id}`, margin, companyY);
    companyY += 4;
  }
  if (dto.company.address) {
    doc.text(dto.company.address, margin, companyY);
    companyY += 4;
  }
  if (dto.company.postal_code || dto.company.city) {
    const loc = [dto.company.postal_code, dto.company.city, dto.company.region].filter(Boolean).join(' ');
    doc.text(loc, margin, companyY);
    companyY += 4;
  }
  if (dto.company.email || dto.company.phone) {
    const contactRow = [dto.company.phone ? `Tel: ${dto.company.phone}` : null, dto.company.email].filter(Boolean).join(' · ');
    doc.text(contactRow, margin, companyY);
    companyY += 4;
  }

  // Right: Document Badge & Identification
  const rightColX = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...accentColor);
  doc.text('PRESUPUESTO', rightColX, currentY + 4, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...primaryColor);
  doc.text(`Nº ${dto.code}`, rightColX, currentY + 10, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...secondaryColor);

  let docMetaY = currentY + 15;
  doc.text(`Fecha emisión: ${formatPdfDate(dto.issue_date)}`, rightColX, docMetaY, { align: 'right' });
  docMetaY += 4;

  if (dto.valid_until) {
    doc.text(`Validez hasta: ${formatPdfDate(dto.valid_until)}`, rightColX, docMetaY, { align: 'right' });
    docMetaY += 4;
  }

  if (dto.reference) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Ref: ${dto.reference}`, rightColX, docMetaY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    docMetaY += 4;
  }

  if (dto.commercial_name) {
    doc.text(`Comercial: ${dto.commercial_name}`, rightColX, docMetaY, { align: 'right' });
    docMetaY += 4;
  }

  currentY = Math.max(companyY, docMetaY) + 5;

  // Horizontal subtle separator line
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 5;

  // 2. Customer & Billing/Installation Card Block (Two Columns)
  const cardBoxWidth = (contentWidth - 6) / 2;
  const cardBoxHeight = 32;

  // Left Card: Customer Fiscal Info
  doc.setFillColor(...lightBg);
  doc.setDrawColor(...borderGray);
  doc.roundedRect(margin, currentY, cardBoxWidth, cardBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...accentColor);
  doc.text('DATOS DEL CLIENTE', margin + 3.5, currentY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...primaryColor);
  const custTitle = dto.customer.trade_name || dto.customer.legal_name || dto.customer.name;
  const splitCustTitle = doc.splitTextToSize(custTitle, cardBoxWidth - 7);
  doc.text(splitCustTitle, margin + 3.5, currentY + 9.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...secondaryColor);
  let custY = currentY + 14 + (splitCustTitle.length > 1 ? (splitCustTitle.length - 1) * 3.5 : 0);

  if (dto.customer.code) {
    doc.text(`Cód. Cliente: ${dto.customer.code}`, margin + 3.5, custY);
    custY += 3.5;
  }
  if (dto.customer.tax_id) {
    doc.text(`NIF/CIF: ${dto.customer.tax_id}`, margin + 3.5, custY);
    custY += 3.5;
  }
  const custContactInfo = [
    dto.customer.phone ? `Tel: ${dto.customer.phone}` : null,
    dto.customer.email ? dto.customer.email : null,
  ].filter(Boolean).join(' · ');
  if (custContactInfo) {
    doc.text(custContactInfo, margin + 3.5, custY);
    custY += 3.5;
  }

  // Right Card: Delivery / Billing Address & Contact Person
  const rightCardX = margin + cardBoxWidth + 6;
  doc.setFillColor(...lightBg);
  doc.setDrawColor(...borderGray);
  doc.roundedRect(rightCardX, currentY, cardBoxWidth, cardBoxHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...accentColor);
  doc.text('DIRECCIÓN Y CONTACTO', rightCardX + 3.5, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...secondaryColor);
  let addrY = currentY + 9.5;

  const addr = dto.customer.installation_address?.street || dto.customer.billing_address?.street;
  if (addr) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryColor);
    doc.text('Dirección:', rightCardX + 3.5, addrY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...secondaryColor);
    const fullStreet = doc.splitTextToSize(addr, cardBoxWidth - 25);
    doc.text(fullStreet, rightCardX + 18, addrY);
    addrY += (fullStreet.length * 3.5);
  }

  const cpCity = [
    dto.customer.installation_address?.postal_code || dto.customer.billing_address?.postal_code,
    dto.customer.installation_address?.city || dto.customer.billing_address?.city,
    dto.customer.installation_address?.region || dto.customer.billing_address?.region,
  ].filter(Boolean).join(' ');

  if (cpCity) {
    doc.text(cpCity, rightCardX + 3.5, addrY);
    addrY += 3.5;
  }

  if (dto.customer.contact_name) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryColor);
    doc.text(`A la atención de: ${dto.customer.contact_name}`, rightCardX + 3.5, addrY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...secondaryColor);
    addrY += 3.5;
    if (dto.customer.contact_phone || dto.customer.contact_email) {
      const cStr = [dto.customer.contact_phone, dto.customer.contact_email].filter(Boolean).join(' · ');
      doc.text(cStr, rightCardX + 3.5, addrY);
    }
  }

  currentY += cardBoxHeight + 5;

  // 3. Central Quotation Lines Table
  const tableRows = dto.lines.map(line => {
    // Build rich multi-line description cell
    const descParts: string[] = [line.description];
    if (line.additional_description && line.additional_description !== line.description) {
      descParts.push(line.additional_description);
    }

    const detailsParts: string[] = [];
    if (line.dimensions_text) {
      detailsParts.push(`Medidas: ${line.dimensions_text}`);
    }
    if (line.characteristics_text) {
      detailsParts.push(line.characteristics_text);
    }
    for (const comment of line.public_comments) {
      detailsParts.push(comment);
    }
    const detailsStr = detailsParts.join('\n');

    return [
      line.line_no.toString(),
      line.product_code || '—',
      descParts.join('\n'),
      detailsStr || '—',
      line.quantity.toLocaleString('es-ES', { maximumFractionDigits: 2 }),
      formatPdfMoney(line.unit_price),
      line.discount_percent > 0 ? `${line.discount_percent}%` : '—',
      formatPdfMoney(line.net_amount),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin, bottom: 20 },
    head: [['#', 'Código', 'Descripción', 'Detalles / Medidas', 'Cant.', 'Precio', 'Dto.', 'Total']],
    body: tableRows,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2.5,
      textColor: primaryColor,
      lineColor: borderGray,
      lineWidth: 0.2,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [241, 245, 249], // Slate 100
      textColor: primaryColor,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
      lineWidth: 0.3,
      lineColor: borderGray,
    },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center' }, // #
      1: { cellWidth: 24, fontStyle: 'bold' }, // Código
      2: { cellWidth: 'auto' }, // Descripción
      3: { cellWidth: 42, fontSize: 7.5, textColor: secondaryColor }, // Medidas / Características
      4: { cellWidth: 14, halign: 'right' }, // Cant.
      5: { cellWidth: 20, halign: 'right' }, // Precio
      6: { cellWidth: 13, halign: 'right' }, // Dto.
      7: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }, // Total
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    didDrawPage: (data) => {
      // Header repeated or page footer
    },
  });

  // 4. Bottom Section: Observations / Commercial Terms & Economic Totals
  const finalY = (doc as any).lastAutoTable.finalY + 5;
  const availableSpace = pageHeight - finalY - 20;

  // If there's not enough room for totals and terms, add a new page
  let bottomY = finalY;
  if (availableSpace < 45) {
    doc.addPage();
    bottomY = margin + 5;
  }

  // Left Column: Commercial Conditions, Payment Terms, Notes
  const leftInfoWidth = 105;
  let conditionsY = bottomY;

  if (dto.payment_method_name || dto.payment_term_name || dto.valid_until) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...primaryColor);
    doc.text('CONDICIONES COMERCIALES', margin, conditionsY + 3);
    conditionsY += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...secondaryColor);

    if (dto.payment_method_name) {
      doc.text(`Forma de pago: ${dto.payment_method_name}`, margin, conditionsY);
      conditionsY += 4;
    }
    if (dto.payment_term_name) {
      doc.text(`Plazo de pago: ${dto.payment_term_name}`, margin, conditionsY);
      conditionsY += 4;
    }
    if (dto.valid_until) {
      doc.text(`Validez de la oferta: ${formatPdfDate(dto.valid_until)}`, margin, conditionsY);
      conditionsY += 4;
    }
    conditionsY += 2;
  }

  if (dto.public_comments.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...primaryColor);
    doc.text('COMENTARIOS', margin, conditionsY + 3);
    conditionsY += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...secondaryColor);
    const splitNotes = doc.splitTextToSize(dto.public_comments.join('\n'), leftInfoWidth);
    doc.text(splitNotes, margin, conditionsY);
    conditionsY += (splitNotes.length * 3.8);
  }

  // Right Column: Summary Totals Box
  const totalsBoxWidth = 65;
  const totalsBoxX = pageWidth - margin - totalsBoxWidth;
  const totalsBoxY = bottomY;

  doc.setFillColor(...lightBg);
  doc.setDrawColor(...borderGray);
  doc.roundedRect(totalsBoxX, totalsBoxY, totalsBoxWidth, 36, 2, 2, 'FD');

  let rowY = totalsBoxY + 6;
  doc.setFontSize(8);

  // Base Imponible
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...secondaryColor);
  doc.text('Base imponible:', totalsBoxX + 4, rowY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text(formatPdfMoney(dto.totals.base_amount), totalsBoxX + totalsBoxWidth - 4, rowY, { align: 'right' });
  rowY += 5.5;

  // Descuentos (if any)
  if (dto.totals.discount_amount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...secondaryColor);
    doc.text('Descuentos:', totalsBoxX + 4, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(220, 38, 38); // Red
    doc.text(`-${formatPdfMoney(dto.totals.discount_amount)}`, totalsBoxX + totalsBoxWidth - 4, rowY, { align: 'right' });
    rowY += 5.5;
  }

  // Impuestos
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...secondaryColor);
  const taxLabel = dto.totals.tax_percent != null ? `Impuestos (${formatPdfPercent(dto.totals.tax_percent)}):` : 'Impuestos:';
  doc.text(taxLabel, totalsBoxX + 4, rowY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text(formatPdfMoney(dto.totals.tax_amount), totalsBoxX + totalsBoxWidth - 4, rowY, { align: 'right' });
  rowY += 5.5;

  // Divider inside totals
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.2);
  doc.line(totalsBoxX + 4, rowY, totalsBoxX + totalsBoxWidth - 4, rowY);
  rowY += 5.5;

  // TOTAL PRESUPUESTO
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...accentColor);
  doc.text('TOTAL', totalsBoxX + 4, rowY);
  doc.setFontSize(10.5);
  doc.text(formatPdfMoney(dto.totals.total_amount), totalsBoxX + totalsBoxWidth - 4, rowY, { align: 'right' });

  // 5. Add Pagination Footer to ALL pages
  const totalPages = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // Slate 400

    doc.setDrawColor(...borderGray);
    doc.setLineWidth(0.2);
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);

    doc.text(
      `Presupuesto ${dto.code} · ${dto.company.name || 'Onin'}`,
      margin,
      pageHeight - 7
    );

    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth - margin,
      pageHeight - 7,
      { align: 'right' }
    );
  }

  return doc;
}

export async function generateAndDownloadQuotationPdf(quotationId: number): Promise<void> {
  const dto = await fetchQuotationPdfData(quotationId);
  const doc = buildQuotationPdf(dto);
  const sanitizedCode = dto.code.replace(/[\/\\]/g, '_');
  doc.save(`Presupuesto_${sanitizedCode}.pdf`);
}

export async function generateQuotationPdfBlob(quotationId: number): Promise<{ blob: Blob; url: string; filename: string; dto: QuotationPdfDTO }> {
  const dto = await fetchQuotationPdfData(quotationId);
  const doc = buildQuotationPdf(dto);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const sanitizedCode = dto.code.replace(/[\/\\]/g, '_');
  const filename = `Presupuesto_${sanitizedCode}.pdf`;
  return { blob, url, filename, dto };
}
