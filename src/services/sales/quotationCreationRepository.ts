import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { getProductLineDefinition, type ProductLineDefinition } from '../catalog/productDefinitionRepository';

export type QuotationOption={id:number;label:string};
export type QuotationAddress={id:number;label:string;street:string;postal_code:string;city:string;region:string|null;address_type:string};
export type ProductLineBehavior={id:number;company_id:number;code:string;name:string;description:string|null;quantity_enabled:boolean;price_enabled:boolean;discount_enabled:boolean;dimensions_enabled:boolean;configuration_enabled:boolean;cut_calculation_enabled:boolean;length_enabled:boolean;characteristics_enabled:boolean;canvas_cut_enabled:boolean};
export type QuotationProductOption={id:number;label:string;code?:string;price?:number;lineBehavior:ProductLineBehavior|null};
export type QuotationLineDimensionDraft={code:string;name:string;value:number|null;unit_id:number|null;unit_code?:string;unit_symbol?:string|null;sort_order:number};
export type QuotationLineCharacteristicDraft={attribute_id:number|null;attribute_value_id:number|null;value_text:string|null;value_number:number|null;value_boolean:boolean|null};
export type QuotationLineDraft={product_id:number|null;description:string;quantity:number;unit_price:number;discount_percent:number;tax_rate_id:number|null;tax_percent:number;dimensions?:QuotationLineDimensionDraft[];characteristics?:QuotationLineCharacteristicDraft[];specific_data?:Record<string,unknown>};
export type QuotationAddressDraft={source_id:number|null;label:string;street:string;postal_code:string;city:string;region:string};
export type CustomerDiscount={discount_percent:number;level:'article'|'familia'};

export type CustomerContactItem = {
  id: number;
  party_id: number;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  department: string | null;
  phone: string | null;
  mobile: string | null;
  email: string | null;
};

export type CustomerContactDataResult = {
  customer_id: number;
  party_id: number;
  company_name: string;
  header_email: string;
  header_phone: string;
  contacts: CustomerContactItem[];
};

function client(){if(!supabase)throw new CoreRepositoryError('Supabase no está configurado.');return supabase;}
async function companyId(){const c=client();const {data:{user},error:ue}=await c.auth.getUser();if(ue||!user)throw new CoreRepositoryError('No hay un usuario autenticado.');const {data,error}=await c.from('user_account').select('company_id').eq('auth_user_id',user.id).maybeSingle();if(error)throw new CoreRepositoryError(error.message);if(data?.company_id==null)throw new CoreRepositoryError('El usuario no tiene empresa asignada.');return Number(data.company_id);}
const partyName=(p:any)=>p?.trade_name||p?.legal_name||'—';

async function getProductLineBehaviors(productIds:number[],companyIdValue:number):Promise<Map<number,ProductLineBehavior>>{const result=new Map<number,ProductLineBehavior>();if(!productIds.length)return result;const c=client();const {data:products,error:pe}=await c.from('product').select('id,family_id').eq('company_id',companyIdValue).in('id',productIds);if(pe)throw new CoreRepositoryError(pe.message);const familyIds=[...new Set((products??[]).map((x:any)=>x.family_id).filter((x:any)=>x!=null))];if(!familyIds.length)return result;const {data:families,error:fe}=await c.from('product_family').select('id,line_behavior_id').eq('company_id',companyIdValue).in('id',familyIds).is('deleted_at',null);if(fe)throw new CoreRepositoryError(fe.message);const behaviorIds=[...new Set((families??[]).map((x:any)=>x.line_behavior_id).filter((x:any)=>x!=null))];if(!behaviorIds.length)return result;const {data:behaviors,error:be}=await c.from('product_line_behavior').select('id,company_id,code,name,description,quantity_enabled,price_enabled,discount_enabled,dimensions_enabled,configuration_enabled,cut_calculation_enabled,length_enabled,characteristics_enabled,canvas_cut_enabled').eq('company_id',companyIdValue).in('id',behaviorIds).eq('active',true).is('deleted_at',null);if(be)throw new CoreRepositoryError(be.message);const byId=new Map((behaviors??[]).map((x:any)=>[Number(x.id),x as ProductLineBehavior]));const familyBehavior=new Map((families??[]).map((x:any)=>[Number(x.id),x.line_behavior_id==null?null:byId.get(Number(x.line_behavior_id))??null]));for(const p of products??[]){const behavior=familyBehavior.get(Number((p as any).family_id))??null;if(behavior)result.set(Number((p as any).id),behavior);}return result;}
async function getProductLineDefinitions(productIds:number[]):Promise<Map<number,ProductLineDefinition>>{const result=new Map<number,ProductLineDefinition>();const unique=[...new Set(productIds)];if(!unique.length)return result;const definitions=await Promise.all(unique.map(async id=>[id,await getProductLineDefinition(id)] as const));for(const [id,definition] of definitions)result.set(id,definition);return result;}
function definitionSnapshot(definition:ProductLineDefinition|null){return definition?{product_id:definition.product_id,measurement_type_id:definition.measurement_type_id,dimensions:definition.dimensions.map(d=>({...d})),characteristics:definition.characteristics.map(c=>({...c,values:c.values.map(v=>({...v}))}))}:null;}
function cleanDimensions(rows:QuotationLineDimensionDraft[]|undefined){return(rows??[]).map((x,i)=>({code:x.code.trim(),name:x.name.trim(),value:x.value==null?null:Number(x.value),unit_id:x.unit_id==null?null:Number(x.unit_id),sort_order:Number.isFinite(x.sort_order)?x.sort_order:i})).filter(x=>x.code&&x.name);}
function dimensionsFromDefinition(definition:ProductLineDefinition|null,rows:QuotationLineDimensionDraft[]|undefined){if(!definition)return cleanDimensions(rows);const byCode=new Map((rows??[]).map(x=>[x.code.trim(),x]));return definition.dimensions.map((d,i)=>{const draft=byCode.get(d.code);return{code:d.code,name:d.name,value:draft?.value==null?null:Number(draft.value),unit_id:d.unit_id,sort_order:i};});}
function cleanCharacteristics(rows:QuotationLineCharacteristicDraft[]|undefined){return(rows??[]).map(x=>({attribute_id:x.attribute_id==null?null:Number(x.attribute_id),attribute_value_id:x.attribute_value_id==null?null:Number(x.attribute_value_id),value_text:x.value_text?.trim()||null,value_number:x.value_number==null?null:Number(x.value_number),value_boolean:x.value_boolean??null})).filter(x=>[x.value_text,x.value_number,x.value_boolean,x.attribute_value_id].filter(v=>v!==null).length===1);}
function characteristicsFromDefinition(definition:ProductLineDefinition|null,rows:QuotationLineCharacteristicDraft[]|undefined){const cleaned=cleanCharacteristics(rows);if(!definition)return cleaned;const allowed=new Set(definition.characteristics.map(c=>c.attribute_id));return cleaned.filter(x=>x.attribute_id!=null&&allowed.has(Number(x.attribute_id)));}

export async function quotationOptions(){const c=client();const cid=await companyId();const [customers,commercials,warehouses,paymentMethods,paymentTerms,taxRates,products,units]=await Promise.all([c.from('customer').select('id,party:party_id(legal_name,trade_name)').is('deleted_at',null).order('id'),c.from('commercial').select('id,party:party_id(legal_name,trade_name)').eq('company_id',cid).eq('active',true).order('id'),c.from('warehouse').select('id,name,code').eq('company_id',cid).eq('active',true).is('deleted_at',null).order('id'),c.from('payment_method').select('id,name,code').eq('company_id',cid).eq('active',true).order('id'),c.from('payment_term').select('id,name,code').eq('company_id',cid).eq('active',true).order('id'),c.from('tax_rate').select('id,name,code,rate').eq('company_id',cid).eq('active',true).order('rate'),c.from('product').select('id,code,commercial_description,technical_description,sales_price,iva_percent').eq('company_id',cid).eq('active',true).is('deleted_at',null).order('code'),c.from('unit').select('id,code,name').eq('company_id',cid).eq('active',true).is('deleted_at',null).order('code')]);for(const r of [customers,commercials,warehouses,paymentMethods,paymentTerms,taxRates,products,units])if(r.error)throw new CoreRepositoryError(r.error.message);const productRows=products.data??[];const behaviors=await getProductLineBehaviors(productRows.map((x:any)=>Number(x.id)),cid);return{customers:(customers.data??[]).map((x:any)=>({id:x.id,label:partyName(x.party)})),commercials:(commercials.data??[]).map((x:any)=>({id:x.id,label:partyName(x.party)})),warehouses:(warehouses.data??[]).map((x:any)=>({id:x.id,label:x.code?`${x.code} · ${x.name}`:x.name})),paymentMethods:(paymentMethods.data??[]).map((x:any)=>({id:x.id,label:x.code?`${x.code} · ${x.name}`:x.name})),paymentTerms:(paymentTerms.data??[]).map((x:any)=>({id:x.id,label:x.code?`${x.code} · ${x.name}`:x.name})),taxRates:(taxRates.data??[]).map((x:any)=>({id:x.id,label:x.code?`${x.code} · ${x.name}`:x.name,rate:Number(x.rate)})),products:productRows.map((x:any)=>({id:x.id,label:x.commercial_description||x.technical_description||x.code,code:x.code,price:Number(x.sales_price||0),lineBehavior:behaviors.get(Number(x.id))??null})),units:(units.data??[]).map((u:any)=>({id:Number(u.id),code:String(u.code||''),name:String(u.name||'')}))};}
export async function customerAddresses(customerId:number):Promise<QuotationAddress[]>{const c=client();const {data:customer,error:ce}=await c.from('customer').select('party_id').eq('id',customerId).maybeSingle();if(ce)throw new CoreRepositoryError(ce.message);if(!customer?.party_id)return[];const {data,error}=await c.from('address').select('id,label,street,postal_code,city,region,address_type').eq('party_id',customer.party_id).is('deleted_at',null).order('id');if(error)throw new CoreRepositoryError(error.message);return(data??[]) as QuotationAddress[];}
export async function customerProductDiscount(customerId:number,productId:number):Promise<CustomerDiscount|null>{const c=client();const {data:customer,error:ce}=await c.from('customer').select('party_id').eq('id',customerId).maybeSingle();if(ce)throw new CoreRepositoryError(ce.message);if(!customer?.party_id)return null;const {data:product,error:pe}=await c.from('product').select('family_id').eq('id',productId).maybeSingle();if(pe)throw new CoreRepositoryError(pe.message);const {data:articleDiscount,error:ae}=await c.from('product_customer_discount').select('discount_percent').eq('customer_party_id',customer.party_id).eq('product_id',productId).eq('active',true).is('deleted_at',null).maybeSingle();if(ae)throw new CoreRepositoryError(ae.message);if(articleDiscount)return{discount_percent:Number(articleDiscount.discount_percent||0),level:'article'};if(!product?.family_id)return null;const {data:familyDiscount,error:fe}=await c.from('customer_family_discount').select('discount_percent').eq('customer_party_id',customer.party_id).eq('product_family_id',product.family_id).eq('active',true).is('deleted_at',null).maybeSingle();if(fe)throw new CoreRepositoryError(fe.message);return familyDiscount?{discount_percent:Number(familyDiscount.discount_percent||0),level:'familia'}:null;}

export async function customerContactsData(customerId: number): Promise<CustomerContactDataResult> {
  const c = client();
  const { data: customer, error: ce } = await c
    .from('customer')
    .select('id,party_id,party:party_id(legal_name,trade_name,email,phone)')
    .eq('id', customerId)
    .maybeSingle();

  if (ce) throw new CoreRepositoryError(ce.message);
  if (!customer?.party_id) return { customer_id: customerId, party_id: 0, company_name: '', header_email: '', header_phone: '', contacts: [] };

  const party = customer.party as any;
  const companyName = party?.trade_name || party?.legal_name || '';
  const headerEmail = party?.email || '';
  const headerPhone = party?.phone || '';

  let { data: contacts, error: coe } = await c
    .from('contact')
    .select('id,party_id,first_name,last_name,job_title,department,phone,mobile,email')
    .eq('party_id', customer.party_id)
    .is('deleted_at', null)
    .order('id');

  if (coe && (coe.message.includes('deleted_at') || coe.code === '42703')) {
    const fallback = await c
      .from('contact')
      .select('id,party_id,first_name,last_name,job_title,department,phone,mobile,email')
      .eq('party_id', customer.party_id)
      .order('id');
    contacts = fallback.data;
    coe = fallback.error;
  }

  if (coe) throw new CoreRepositoryError(coe.message);

  return {
    customer_id: customerId,
    party_id: customer.party_id,
    company_name: companyName,
    header_email: headerEmail,
    header_phone: headerPhone,
    contacts: (contacts ?? []) as CustomerContactItem[],
  };
}

export async function createQuotation(input: {
  customer_id: number;
  commercial_id: number | null;
  warehouse_id: number | null;
  contact_id?: number | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  billing_address_id: number | null;
  installation_address_id: number | null;
  billing_address: QuotationAddressDraft | null;
  installation_address: QuotationAddressDraft | null;
  payment_method_id: number | null;
  payment_term_id: number | null;
  measurement_id: number | null;
  issue_date: string;
  valid_until: string | null;
  reference: string;
  notes: string;
  lines: QuotationLineDraft[];
}): Promise<number> {
  const c = client();
  const cid = await companyId();
  if (!input.lines.length) throw new CoreRepositoryError('El presupuesto debe tener al menos una línea.');

  const productIds = input.lines.map(l => l.product_id).filter((id): id is number => id !== null);
  const [behaviors, definitions] = await Promise.all([
    getProductLineBehaviors(productIds, cid),
    getProductLineDefinitions(productIds),
  ]);

  const year = Number(input.issue_date.slice(0, 4));
  const { data: last, error: le } = await c
    .from('quotation')
    .select('number')
    .eq('company_id', cid)
    .eq('year', year)
    .order('number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (le) throw new CoreRepositoryError(le.message);

  const number = Number(last?.number || 0) + 1;
  const code = `${year}/${number}`;

  const lines = input.lines.map((line, i) => {
    const taxPercent = Math.max(0, Number(line.tax_percent) || 0);
    const net = Math.max(0, line.quantity * line.unit_price * (1 - line.discount_percent / 100));
    const tax = Math.max(0, (net * taxPercent) / 100);
    const behavior = line.product_id === null ? null : behaviors.get(line.product_id) ?? null;
    const definition = line.product_id === null ? null : definitions.get(line.product_id) ?? null;
    return {
      line_no: i + 1,
      product_id: line.product_id,
      description: line.description.trim(),
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount_percent: line.discount_percent,
      tax_rate_id: line.tax_rate_id,
      tax_percent: taxPercent,
      net_amount: net,
      tax_amount: tax,
      total_amount: net + tax,
      line_behavior_id: behavior?.id ?? null,
      line_behavior_snapshot: behavior
        ? {
            id: behavior.id,
            code: behavior.code,
            name: behavior.name,
            description: behavior.description,
            quantity_enabled: behavior.quantity_enabled,
            price_enabled: behavior.price_enabled,
            discount_enabled: behavior.discount_enabled,
            dimensions_enabled: behavior.dimensions_enabled,
            configuration_enabled: behavior.configuration_enabled,
            cut_calculation_enabled: behavior.cut_calculation_enabled,
            length_enabled: behavior.length_enabled,
            characteristics_enabled: behavior.characteristics_enabled,
            canvas_cut_enabled: behavior.canvas_cut_enabled,
          }
        : null,
      product_definition_snapshot: definitionSnapshot(definition),
      specific_data: line.specific_data ?? {},
    };
  });

  if (lines.some(l => !l.description)) throw new CoreRepositoryError('Todas las líneas deben tener descripción.');

  const net = lines.reduce((s, l) => s + l.net_amount, 0);
  const tax = lines.reduce((s, l) => s + l.tax_amount, 0);
  const discount = lines.reduce((s, l) => s + (l.quantity * l.unit_price - l.net_amount), 0);
  const ba = input.billing_address;
  const ia = input.installation_address;

  const insertPayload: Record<string, any> = {
    company_id: cid,
    year,
    number,
    code,
    customer_id: input.customer_id,
    commercial_id: input.commercial_id,
    warehouse_id: input.warehouse_id,
    contact_id: input.contact_id ?? null,
    contact_name: input.contact_name?.trim() || null,
    contact_email: input.contact_email?.trim() || null,
    contact_phone: input.contact_phone?.trim() || null,
    billing_address_id: input.billing_address_id,
    installation_address_id: input.installation_address_id,
    billing_address_street: ba?.street || null,
    billing_address_postal_code: ba?.postal_code || null,
    billing_address_city: ba?.city || null,
    billing_address_region: ba?.region || null,
    installation_address_street: ia?.street || null,
    installation_address_postal_code: ia?.postal_code || null,
    installation_address_city: ia?.city || null,
    installation_address_region: ia?.region || null,
    payment_method_id: input.payment_method_id,
    payment_term_id: input.payment_term_id,
    measurement_id: input.measurement_id,
    issue_date: input.issue_date,
    valid_until: input.valid_until || null,
    status: 'DRAFT',
    reference: input.reference.trim() || null,
    notes: input.notes.trim() || null,
    net_amount: net,
    discount_amount: discount,
    tax_amount: tax,
    total_amount: net + tax,
  };

  let { data: header, error: headerError } = await c.from('quotation').insert(insertPayload).select('id').single();
  if (
    headerError &&
    (headerError.message.includes('contact_') ||
      headerError.code === '42703' ||
      headerError.code === 'PGRST100' ||
      headerError.code === 'PGRST204')
  ) {
    // Attempt 1: Keep contact_id, omit only custom columns contact_name, contact_email, contact_phone
    const payloadWithContactId = { ...insertPayload };
    delete payloadWithContactId.contact_name;
    delete payloadWithContactId.contact_email;
    delete payloadWithContactId.contact_phone;
    const retry1 = await c.from('quotation').insert(payloadWithContactId).select('id').single();
    if (!retry1.error && retry1.data) {
      header = retry1.data;
      headerError = null;
    } else {
      // Attempt 2: If contact_id also fails, remove all contact fields
      const payloadWithoutAnyContact = { ...payloadWithContactId };
      delete payloadWithoutAnyContact.contact_id;
      const retry2 = await c.from('quotation').insert(payloadWithoutAnyContact).select('id').single();
      header = retry2.data;
      headerError = retry2.error;
    }
  }

  if (headerError || !header) throw new CoreRepositoryError(headerError?.message || 'No se pudo crear la cabecera del presupuesto.');

  const { data: createdLines, error: lineError } = await c
    .from('quotation_line')
    .insert(lines.map(line => ({ ...line, quotation_id: header.id })))
    .select('id,line_no');

  if (lineError || !createdLines) {
    await c.from('quotation').delete().eq('id', header.id);
    throw new CoreRepositoryError(lineError?.message || 'No se pudieron guardar las líneas del presupuesto.');
  }

  const lineIdByNo = new Map((createdLines as any[]).map(row => [Number(row.line_no), Number(row.id)]));
  const dimensions: any[] = [];
  const characteristics: any[] = [];

  input.lines.forEach((line, index) => {
    const quotationLineId = lineIdByNo.get(index + 1);
    if (!quotationLineId) return;

    const definition = line.product_id === null ? null : definitions.get(line.product_id) ?? null;

    for (const d of dimensionsFromDefinition(definition, line.dimensions)) {
      dimensions.push({ ...d, quotation_line_id: quotationLineId });
    }

    for (const ch of characteristicsFromDefinition(definition, line.characteristics)) {
      characteristics.push({ ...ch, quotation_line_id: quotationLineId });
    }
  });

  if (dimensions.length) {
    const { error } = await c.from('quotation_line_dimension').insert(dimensions);
    if (error) {
      await c.from('quotation').delete().eq('id', header.id);
      throw new CoreRepositoryError(error.message);
    }
  }

  if (characteristics.length) {
    const { error } = await c.from('quotation_line_characteristic').insert(characteristics);
    if (error) {
      await c.from('quotation').delete().eq('id', header.id);
      throw new CoreRepositoryError(error.message);
    }
  }

  return Number(header.id);
}
