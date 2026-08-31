import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { quotationOptions, type QuotationLineDimensionDraft, type QuotationLineCharacteristicDraft, type QuotationCommentDraft, type ProductLineBehavior } from './quotationCreationRepository';
import { getProductLineDefinition, type ProductLineDefinition } from '../catalog/productDefinitionRepository';

export type QuotationEditLine = {
  id: number;
  line_no: number;
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_rate_id: number | null;
  tax_percent: number;
  comments: QuotationCommentDraft[];
  line_behavior_id: number | null;
  line_behavior_snapshot: ProductLineBehavior | null;
  product_definition_snapshot?: ProductLineDefinition | null;
  dimensions: QuotationLineDimensionDraft[];
  characteristics: QuotationLineCharacteristicDraft[];
  specific_data: Record<string, unknown>;
};

export type QuotationEditData = {
  id: number; code: string; customer_id: number | null; commercial_id: number | null; warehouse_id: number | null;
  contact_id: number | null; contact_name: string; contact_email: string; contact_phone: string;
  billing_address_id: number | null; installation_address_id: number | null;
  billing_address: { label: string; street: string; postal_code: string; city: string; region: string }; installation_address: { label: string; street: string; postal_code: string; city: string; region: string };
  payment_method_id: number | null; payment_term_id: number | null; tax_rate_id: number | null; tax_percent: number; issue_date: string; valid_until: string | null; reference: string; notes: string; status: string; comments: QuotationCommentDraft[]; lines: QuotationEditLine[];
};

function client() { if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.'); return supabase; }
async function companyId() { const c=client(); const {data:{user},error:ue}=await c.auth.getUser(); if(ue||!user)throw new CoreRepositoryError('No hay un usuario autenticado.'); const {data,error}=await c.from('user_account').select('company_id').eq('auth_user_id',user.id).maybeSingle(); if(error)throw new CoreRepositoryError(error.message); if(data?.company_id==null)throw new CoreRepositoryError('El usuario no tiene empresa asignada.'); return Number(data.company_id); }
async function getProductLineDefinitions(productIds:number[]):Promise<Map<number,ProductLineDefinition>>{const result=new Map<number,ProductLineDefinition>();const unique=[...new Set(productIds)];if(!unique.length)return result;const definitions=await Promise.all(unique.map(async id=>[id,await getProductLineDefinition(id)] as const));for(const [id,definition] of definitions)result.set(id,definition);return result;}
function snapshotDimensions(snapshot:ProductLineDefinition|null,rows:QuotationLineDimensionDraft[]){if(!snapshot)return rows.map((x,i)=>({code:x.code.trim(),name:x.name.trim(),value:x.value==null?null:Number(x.value),unit_id:x.unit_id==null?null:Number(x.unit_id),sort_order:Number.isFinite(x.sort_order)?x.sort_order:i})).filter(x=>x.code&&x.name);const byCode=new Map(rows.map(x=>[x.code.trim(),x]));return snapshot.dimensions.map((d,i)=>{const draft=byCode.get(d.code);return{code:d.code,name:d.name,value:draft?.value==null?null:Number(draft.value),unit_id:d.unit_id,sort_order:i};});}
function snapshotCharacteristics(snapshot:ProductLineDefinition|null,rows:QuotationLineCharacteristicDraft[]){const cleaned=rows.map(x=>({attribute_id:x.attribute_id==null?null:Number(x.attribute_id),attribute_value_id:x.attribute_value_id==null?null:Number(x.attribute_value_id),value_text:x.value_text?.trim()||null,value_number:x.value_number==null?null:Number(x.value_number),value_boolean:x.value_boolean??null})).filter(x=>[x.value_text,x.value_number,x.value_boolean,x.attribute_value_id].filter(v=>v!==null).length===1);if(!snapshot)return cleaned;const allowed=new Set(snapshot.characteristics.map(c=>c.attribute_id));return cleaned.filter(x=>x.attribute_id!=null&&allowed.has(Number(x.attribute_id)));}

export async function quotationForEdit(id: number): Promise<QuotationEditData> {
  const c = client();
  const cid = await companyId();

  let q: any = null;
  const { data: qWithContacts, error: qeWithContacts } = await c
    .from('quotation')
    .select(
      'id,code,customer_id,commercial_id,warehouse_id,contact_id,contact_name,contact_email,contact_phone,contact:contact_id(id,first_name,last_name,email,phone,mobile,job_title,department),billing_address_id,installation_address_id,billing_address_street,billing_address_postal_code,billing_address_city,billing_address_region,installation_address_street,installation_address_postal_code,installation_address_city,installation_address_region,payment_method_id,payment_term_id,tax_rate_id,tax_percent,issue_date,valid_until,reference,notes,status,lines:quotation_line(id,line_no,product_id,description,quantity,unit_price,discount_percent,tax_rate_id,tax_percent,line_behavior_id,line_behavior_snapshot,product_definition_snapshot,specific_data,dimensions:quotation_line_dimension(code,name,value,unit_id,sort_order),characteristics:quotation_line_characteristic(attribute_id,attribute_value_id,value_text,value_number,value_boolean))'
    )
    .eq('company_id', cid)
    .eq('id', id)
    .maybeSingle();

  if (qeWithContacts) {
    // Try query with contact_id and contact relation (omitting contact_name/email/phone custom columns if they don't exist)
    const { data: qWithContactId, error: qeWithContactId } = await c
      .from('quotation')
      .select(
        'id,code,customer_id,commercial_id,warehouse_id,contact_id,contact:contact_id(id,first_name,last_name,email,phone,mobile,job_title,department),billing_address_id,installation_address_id,billing_address_street,billing_address_postal_code,billing_address_city,billing_address_region,installation_address_street,installation_address_postal_code,installation_address_city,installation_address_region,payment_method_id,payment_term_id,tax_rate_id,tax_percent,issue_date,valid_until,reference,notes,status,lines:quotation_line(id,line_no,product_id,description,quantity,unit_price,discount_percent,tax_rate_id,tax_percent,line_behavior_id,line_behavior_snapshot,product_definition_snapshot,specific_data,dimensions:quotation_line_dimension(code,name,value,unit_id,sort_order),characteristics:quotation_line_characteristic(attribute_id,attribute_value_id,value_text,value_number,value_boolean))'
      )
      .eq('company_id', cid)
      .eq('id', id)
      .maybeSingle();

    if (!qeWithContactId && qWithContactId) {
      q = qWithContactId;
    } else {
      // Fallback without contact
      const { data: qFallback, error: qeFallback } = await c
        .from('quotation')
        .select(
          'id,code,customer_id,commercial_id,warehouse_id,billing_address_id,installation_address_id,billing_address_street,billing_address_postal_code,billing_address_city,billing_address_region,installation_address_street,installation_address_postal_code,installation_address_city,installation_address_region,payment_method_id,payment_term_id,tax_rate_id,tax_percent,issue_date,valid_until,reference,notes,status,lines:quotation_line(id,line_no,product_id,description,quantity,unit_price,discount_percent,tax_rate_id,tax_percent,line_behavior_id,line_behavior_snapshot,product_definition_snapshot,specific_data,dimensions:quotation_line_dimension(code,name,value,unit_id,sort_order),characteristics:quotation_line_characteristic(attribute_id,attribute_value_id,value_text,value_number,value_boolean))'
        )
        .eq('company_id', cid)
        .eq('id', id)
        .maybeSingle();

      if (qeFallback) throw new CoreRepositoryError(qeFallback.message);
      q = qFallback;
    }
  } else {
    q = qWithContacts;
  }

  if (!q) throw new CoreRepositoryError('Presupuesto no encontrado.');

  // Resolve contact details
  let resolvedContactName = q.contact_name ?? '';
  let resolvedContactEmail = q.contact_email ?? '';
  let resolvedContactPhone = q.contact_phone ?? '';
  const resolvedContactId = q.contact_id == null ? null : Number(q.contact_id);

  if (resolvedContactId && (!resolvedContactName || !resolvedContactEmail || !resolvedContactPhone)) {
    let relContact = q.contact;
    if (!relContact) {
      const { data: cData } = await c.from('contact').select('id,first_name,last_name,email,phone,mobile').eq('id', resolvedContactId).maybeSingle();
      relContact = cData;
    }
    if (relContact) {
      if (!resolvedContactName) resolvedContactName = [relContact.first_name, relContact.last_name].filter(Boolean).join(' ');
      if (!resolvedContactEmail) resolvedContactEmail = relContact.email || '';
      if (!resolvedContactPhone) resolvedContactPhone = relContact.phone || relContact.mobile || '';
    }
  }

  const lines = ((q.lines ?? []) as any[])
    .sort((a, b) => Number(a.line_no) - Number(b.line_no))
    .map(line => ({
      id: Number(line.id),
      line_no: Number(line.line_no),
      product_id: line.product_id == null ? null : Number(line.product_id),
      description: line.description ?? '',
      quantity: Number(line.quantity ?? 0),
      unit_price: Number(line.unit_price ?? 0),
      discount_percent: Number(line.discount_percent ?? 0),
      tax_rate_id: line.tax_rate_id == null ? null : Number(line.tax_rate_id),
      tax_percent: Number(line.tax_percent ?? 0),
      line_behavior_id: line.line_behavior_id == null ? null : Number(line.line_behavior_id),
      line_behavior_snapshot: line.line_behavior_snapshot ?? null,
      product_definition_snapshot: line.product_definition_snapshot ?? null,
      dimensions: (line.dimensions ?? []).map((d: any) => ({
        code: d.code,
        name: d.name,
        value: d.value == null ? null : Number(d.value),
        unit_id: d.unit_id == null ? null : Number(d.unit_id),
        sort_order: Number(d.sort_order ?? 0),
      })),
      characteristics: (line.characteristics ?? []).map((ch: any) => ({
        attribute_id: ch.attribute_id == null ? null : Number(ch.attribute_id),
        attribute_value_id: ch.attribute_value_id == null ? null : Number(ch.attribute_value_id),
        value_text: ch.value_text ?? null,
        value_number: ch.value_number == null ? null : Number(ch.value_number),
        value_boolean: ch.value_boolean ?? null,
      })),
      specific_data: line.specific_data ?? {},
    }));

  const { data: commentRows, error: commentsError } = await c
    .from('quotation_comment')
    .select('quotation_line_id,text,is_public')
    .eq('quotation_id', Number(q.id))
    .order('created_at');
  if (commentsError) throw new CoreRepositoryError(commentsError.message);

  const headerComments: QuotationCommentDraft[] = [];
  const commentsByLineId = new Map<number, QuotationCommentDraft[]>();
  for (const row of (commentRows ?? []) as any[]) {
    const draft: QuotationCommentDraft = { text: row.text, is_public: Boolean(row.is_public) };
    if (row.quotation_line_id == null) {
      headerComments.push(draft);
    } else {
      const lineId = Number(row.quotation_line_id);
      const list = commentsByLineId.get(lineId) ?? [];
      list.push(draft);
      commentsByLineId.set(lineId, list);
    }
  }
  const linesWithComments = lines.map(line => ({ ...line, comments: commentsByLineId.get(line.id) ?? [] }));

  return {
    id: Number(q.id),
    code: q.code,
    customer_id: q.customer_id == null ? null : Number(q.customer_id),
    commercial_id: q.commercial_id == null ? null : Number(q.commercial_id),
    warehouse_id: q.warehouse_id == null ? null : Number(q.warehouse_id),
    contact_id: resolvedContactId,
    contact_name: resolvedContactName,
    contact_email: resolvedContactEmail,
    contact_phone: resolvedContactPhone,
    billing_address_id: q.billing_address_id == null ? null : Number(q.billing_address_id),
    installation_address_id: q.installation_address_id == null ? null : Number(q.installation_address_id),
    billing_address: {
      label: q.billing_address_label ?? '',
      street: q.billing_address_street ?? '',
      postal_code: q.billing_address_postal_code ?? '',
      city: q.billing_address_city ?? '',
      region: q.billing_address_region ?? '',
    },
    installation_address: {
      label: q.installation_address_label ?? '',
      street: q.installation_address_street ?? '',
      postal_code: q.installation_address_postal_code ?? '',
      city: q.installation_address_city ?? '',
      region: q.installation_address_region ?? '',
    },
    payment_method_id: q.payment_method_id == null ? null : Number(q.payment_method_id),
    payment_term_id: q.payment_term_id == null ? null : Number(q.payment_term_id),
    tax_rate_id: q.tax_rate_id == null ? null : Number(q.tax_rate_id),
    tax_percent: Number(q.tax_percent ?? 0),
    issue_date: q.issue_date,
    valid_until: q.valid_until,
    reference: q.reference ?? '',
    notes: q.notes ?? '',
    status: q.status,
    comments: headerComments,
    lines: linesWithComments,
  };
}

export async function updateQuotationContact(
  quotationId: number,
  contact: {
    contact_id: number | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  }
): Promise<void> {
  const c = client();
  const cid = await companyId();

  const payload: Record<string, any> = {
    contact_id: contact.contact_id ?? null,
    contact_name: contact.contact_name?.trim() || null,
    contact_email: contact.contact_email?.trim() || null,
    contact_phone: contact.contact_phone?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await c.from('quotation').update(payload).eq('company_id', cid).eq('id', quotationId);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function updateQuotation(input: {
  id: number;
  customer_id: number | null;
  commercial_id: number | null;
  warehouse_id: number | null;
  contact_id?: number | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  billing_address_id: number | null;
  installation_address_id: number | null;
  billing_address: QuotationEditData['billing_address'];
  installation_address: QuotationEditData['installation_address'];
  payment_method_id: number | null;
  payment_term_id: number | null;
  issue_date: string;
  valid_until: string | null;
  status?: string;
  reference: string;
  comments: QuotationCommentDraft[];
  lines: Array<Omit<QuotationEditLine, 'id'>>;
}) {
  const c = client();
  const cid = await companyId();

  if (!input.lines.length) throw new CoreRepositoryError('El presupuesto debe tener al menos una línea.');
  if (input.lines.some(line => !line.description.trim())) throw new CoreRepositoryError('Todas las líneas deben tener descripción.');

  const { data: existingLines, error: existingError } = await c
    .from('quotation_line')
    .select('id,line_no,product_id,product_definition_snapshot')
    .eq('quotation_id', input.id)
    .order('line_no');

  if (existingError) throw new CoreRepositoryError(existingError.message);

  const existingByLineNo = new Map((existingLines ?? []).map((row: any) => [Number(row.line_no), row]));
  const productIds = input.lines.map(l => l.product_id).filter((id): id is number => id !== null);
  const definitions = await getProductLineDefinitions(productIds);

  const lines = input.lines.map((line, index) => {
    const existing = existingByLineNo.get(index + 1);
    const sameProduct = existing && Number(existing.product_id) === Number(line.product_id);
    const snapshot = sameProduct && existing.product_definition_snapshot
      ? (existing.product_definition_snapshot as ProductLineDefinition)
      : line.product_id == null
      ? null
      : definitions.get(line.product_id) ?? null;

    const taxPercent = Math.max(0, Number(line.tax_percent) || 0);
    const net = Math.max(0, Number(line.quantity || 0) * Number(line.unit_price || 0) * (1 - Number(line.discount_percent || 0) / 100));
    const tax = Math.max(0, (net * taxPercent) / 100);

    return {
      line_no: index + 1,
      product_id: line.product_id,
      description: line.description.trim(),
      quantity: Number(line.quantity || 0),
      unit_price: Number(line.unit_price || 0),
      discount_percent: Number(line.discount_percent || 0),
      tax_rate_id: line.tax_rate_id,
      tax_percent: taxPercent,
      net_amount: net,
      tax_amount: tax,
      total_amount: net + tax,
      line_behavior_id: line.line_behavior_id,
      line_behavior_snapshot: line.line_behavior_snapshot,
      product_definition_snapshot: snapshot,
      specific_data: line.specific_data ?? {},
    };
  });

  const net = lines.reduce((sum, line) => sum + line.net_amount, 0);
  const tax = lines.reduce((sum, line) => sum + line.tax_amount, 0);
  const discount = lines.reduce((sum, line) => sum + (line.quantity * line.unit_price - line.net_amount), 0);

  const ba = input.billing_address;
  const ia = input.installation_address;

  const updatePayload: Record<string, any> = {
    customer_id: input.customer_id,
    commercial_id: input.commercial_id,
    warehouse_id: input.warehouse_id,
    contact_id: input.contact_id ?? null,
    contact_name: input.contact_name?.trim() || null,
    contact_email: input.contact_email?.trim() || null,
    contact_phone: input.contact_phone?.trim() || null,
    billing_address_id: input.billing_address_id,
    installation_address_id: input.installation_address_id,
    billing_address_street: ba.street || null,
    billing_address_postal_code: ba.postal_code || null,
    billing_address_city: ba.city || null,
    billing_address_region: ba.region || null,
    installation_address_street: ia.street || null,
    installation_address_postal_code: ia.postal_code || null,
    installation_address_city: ia.city || null,
    installation_address_region: ia.region || null,
    payment_method_id: input.payment_method_id,
    payment_term_id: input.payment_term_id,
    issue_date: input.issue_date,
    valid_until: input.valid_until || null,
    reference: input.reference.trim() || null,
    net_amount: net,
    discount_amount: discount,
    tax_amount: tax,
    total_amount: net + tax,
    updated_at: new Date().toISOString(),
  };

  if (input.status) updatePayload.status = input.status;

  let { error: headerError } = await c.from('quotation').update(updatePayload).eq('company_id', cid).eq('id', input.id);
  if (
    headerError &&
    (headerError.message.includes('contact_') ||
      headerError.code === '42703' ||
      headerError.code === 'PGRST100' ||
      headerError.code === 'PGRST204')
  ) {
    // Attempt 1: Keep contact_id, omit only custom text columns
    const payloadWithContactId = { ...updatePayload };
    delete payloadWithContactId.contact_name;
    delete payloadWithContactId.contact_email;
    delete payloadWithContactId.contact_phone;
    const retry1 = await c.from('quotation').update(payloadWithContactId).eq('company_id', cid).eq('id', input.id);
    if (!retry1.error) {
      headerError = null;
    } else {
      // Attempt 2: If contact_id also fails, remove all contact fields
      const payloadWithoutAnyContact = { ...payloadWithContactId };
      delete payloadWithoutAnyContact.contact_id;
      const retry2 = await c.from('quotation').update(payloadWithoutAnyContact).eq('company_id', cid).eq('id', input.id);
      headerError = retry2.error;
    }
  }

  if (headerError) throw new CoreRepositoryError(headerError.message);

  const { error: commentsDeleteError } = await c.from('quotation_comment').delete().eq('quotation_id', input.id);
  if (commentsDeleteError) throw new CoreRepositoryError(commentsDeleteError.message);

  const oldIds = (existingLines ?? []).map((row: any) => Number(row.id));
  if (oldIds.length) {
    const { error: dimensionsError } = await c.from('quotation_line_dimension').delete().in('quotation_line_id', oldIds);
    if (dimensionsError) throw new CoreRepositoryError(dimensionsError.message);

    const { error: characteristicsError } = await c.from('quotation_line_characteristic').delete().in('quotation_line_id', oldIds);
    if (characteristicsError) throw new CoreRepositoryError(characteristicsError.message);

    const { error: linesDeleteError } = await c.from('quotation_line').delete().in('id', oldIds);
    if (linesDeleteError) throw new CoreRepositoryError(linesDeleteError.message);
  }

  const { data: created, error: lineError } = await c
    .from('quotation_line')
    .insert(lines.map(line => ({ ...line, quotation_id: input.id })))
    .select('id,line_no');

  if (lineError || !created) throw new CoreRepositoryError(lineError?.message || 'No se pudieron guardar las líneas del presupuesto.');

  const lineIds = new Map((created as any[]).map(row => [Number(row.line_no), Number(row.id)]));
  const dimensions: any[] = [];
  const characteristics: any[] = [];
  const comments: any[] = (input.comments ?? []).map(cm => ({
    quotation_id: input.id,
    quotation_line_id: null,
    text: cm.text,
    is_public: cm.is_public,
  }));

  input.lines.forEach((line, index) => {
    const quotationLineId = lineIds.get(index + 1);
    if (!quotationLineId) return;

    const snapshot = lines[index].product_definition_snapshot as ProductLineDefinition | null;

    for (const d of snapshotDimensions(snapshot, line.dimensions ?? [])) {
      dimensions.push({ ...d, quotation_line_id: quotationLineId });
    }

    for (const ch of snapshotCharacteristics(snapshot, line.characteristics ?? [])) {
      characteristics.push({ ...ch, quotation_line_id: quotationLineId });
    }

    for (const cm of line.comments ?? []) {
      comments.push({ quotation_id: input.id, quotation_line_id: quotationLineId, text: cm.text, is_public: cm.is_public });
    }
  });

  if (dimensions.length) {
    const { error } = await c.from('quotation_line_dimension').insert(dimensions);
    if (error) throw new CoreRepositoryError(error.message);
  }

  if (characteristics.length) {
    const { error } = await c.from('quotation_line_characteristic').insert(characteristics);
    if (error) throw new CoreRepositoryError(error.message);
  }

  if (comments.length) {
    const { error } = await c.from('quotation_comment').insert(comments);
    if (error) throw new CoreRepositoryError(error.message);
  }

  return input.id;
}

export { quotationOptions };
