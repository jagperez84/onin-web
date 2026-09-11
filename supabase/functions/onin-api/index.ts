import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ContactInput = { first_name?: string; last_name?: string; job_title?: string; department?: string; phone?: string; mobile?: string; email?: string; notes?: string };
type CustomerInput = { legal_name?: string; trade_name?: string; tax_id?: string; email?: string; phone?: string; address?: { street?: string; postal_code?: string; city?: string; region?: string; country_code?: string }; contacts?: ContactInput[] };

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...cors}});
const normalize=(v:unknown)=>typeof v==='string'?v.trim():v;
function validEmail(v:string){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)}
function validPhone(v:string){const c=v.replace(/[\s().-]/g,'');return /^(?:\+34|0034)?[6789]\d{8}$/.test(c)}
function validSpanishTaxId(raw:string){const v=raw.toUpperCase().replace(/[\s-]/g,'');if(/^[XYZ]\d{7}[A-Z]$/.test(v)){const l='TRWAGMYFPDXBNJZSQVHLCKE';const n=parseInt(v.replace('X','0').replace('Y','1').replace('Z','2').slice(0,8),10);return l[n%23]===v[8]}if(/^\d{8}[A-Z]$/.test(v)){const l='TRWAGMYFPDXBNJZSQVHLCKE';return l[parseInt(v.slice(0,8),10)%23]===v[8]}if(/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(v)){const d=v.slice(1,8);let s=0;for(let i=0;i<d.length;i++){const n=parseInt(d[i],10);s+=i%2===0?(n*2>9?n*2-9:n*2):n}const ctrl=(10-s%10)%10;return /[PQRSNW]/.test(v[0])?'JABCDEFGHI'[ctrl]===v[8]:String(ctrl)===v[8]}return false}
function validateContact(c:ContactInput){const email=normalize(c.email) as string|undefined,phone=normalize(c.phone) as string|undefined,mobile=normalize(c.mobile) as string|undefined;if(email&&!validEmail(email))return 'El e-mail del contacto no tiene un formato válido.';if(phone&&!validPhone(phone))return 'El teléfono del contacto no tiene un formato válido.';if(mobile&&!validPhone(mobile))return 'El móvil del contacto no tiene un formato válido.';if(!(normalize(c.first_name)||normalize(c.last_name)))return 'El contacto debe tener nombre o apellidos.';return null}
function resolveRoute(req:Request){const raw=new URL(req.url).pathname.split('/').filter(Boolean),i=raw.indexOf('onin-api');return i>=0?raw.slice(i+1):raw}
function toContact(c:any){return{id:c.id,first_name:c.first_name,last_name:c.last_name,job_title:c.job_title,department:c.department,phone:c.phone,mobile:c.mobile,email:c.email,notes:c.notes,active:c.active}}
function toCustomer(p:any,customerId:number|null,address:any,contacts:any[]){return{id:customerId,party_id:p.id,legal_name:p.legal_name,trade_name:p.trade_name,tax_id:p.tax_id,email:p.email,phone:p.phone,address:address?{street:address.street,postal_code:address.postal_code,city:address.city,region:address.region,country_code:address.country_code}:null,contacts:contacts.map(toContact)}}

async function requireContext(req:Request):Promise<{db:SupabaseClient;companyId:number}> {
  const auth=req.headers.get('Authorization');
  if(!auth?.startsWith('Bearer '))throw json({error:'Unauthorized'},401);
  // Never use service_role for tenant-owned CRUD. The request-scoped client makes
  // Postgres RLS the final authorization boundary for every customer operation.
  const db=createClient(supabaseUrl,anonKey,{auth:{persistSession:false},global:{headers:{Authorization:auth}}});
  const {data:{user},error}=await db.auth.getUser();
  if(error||!user)throw json({error:'Unauthorized'},401);
  const {data:account,error:accountError}=await db.from('user_account').select('company_id,active').eq('auth_user_id',user.id).maybeSingle();
  if(accountError||!account?.active||account.company_id==null)throw json({error:'Usuario sin realm activo.'},403);
  return {db,companyId:Number(account.company_id)};
}

async function getCustomerById(db:SupabaseClient,customerId:number){
  const {data:c,error:ce}=await db.from('customer').select('id,party_id').eq('id',customerId).maybeSingle();
  if(ce||!c)return null;
  const {data:p,error:pe}=await db.from('party').select('*').eq('id',c.party_id).maybeSingle();
  if(pe||!p)return null;
  const {data:role}=await db.from('party_role').select('role_code').eq('party_id',c.party_id).eq('role_code','CUSTOMER').maybeSingle();
  if(!role)return null;
  const {data:address}=await db.from('address').select('*').eq('party_id',c.party_id).eq('address_type','ACTIVITY').maybeSingle();
  const {data:contacts}=await db.from('contact').select('*').eq('party_id',c.party_id).eq('active',true).order('last_name',{ascending:true});
  return toCustomer(p,c.id,address,contacts||[]);
}

async function main(req:Request){
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  const {db,companyId}=await requireContext(req);
  const parts=resolveRoute(req);
  if(parts[0]!=='customers')return json({error:'Not found'},404);
  const customerId=parts[1]?Number(parts[1]):null,subresource=parts[2]||null,subId=parts[3]?Number(parts[3]):null;

  if(req.method==='GET'&&customerId===null){
    const {data:customers,error}=await db.from('customer').select('id,party_id').order('id');
    if(error)throw error;
    const ids=(customers||[]).map(c=>c.party_id);
    if(!ids.length)return json([]);
    const {data:parties,error:pe}=await db.from('party').select('*').eq('company_id',companyId).in('id',ids).order('legal_name');
    if(pe)throw pe;
    const {data:addresses,error:ae}=await db.from('address').select('*').in('party_id',ids).eq('address_type','ACTIVITY');
    if(ae)throw ae;
    const amap=new Map((addresses||[]).map(a=>[a.party_id,a])),cmap=new Map((customers||[]).map(c=>[c.party_id,c.id]));
    return json((parties||[]).map(p=>toCustomer(p,cmap.get(p.id)??null,amap.get(p.id),[])));
  }

  if(customerId===null){
    if(req.method!=='POST')return json({error:'Method not allowed'},405);
    const body:CustomerInput=await req.json(),legalName=normalize(body.legal_name) as string|undefined,tradeName=normalize(body.trade_name) as string|undefined,taxId=normalize(body.tax_id) as string|undefined,email=normalize(body.email) as string|undefined,phone=normalize(body.phone) as string|undefined;
    if(!legalName)return json({error:'El nombre fiscal es obligatorio.'},400);
    if(!taxId)return json({error:'CIF / NIF es obligatorio.'},400);
    if(!validSpanishTaxId(taxId))return json({error:'El CIF / NIF no es válido.'},400);
    if(email&&!validEmail(email))return json({error:'El e-mail no tiene un formato válido.'},400);
    if(phone&&!validPhone(phone))return json({error:'El teléfono no tiene un formato válido.'},400);
    for(const c of(body.contacts||[])){const err=validateContact(c);if(err)return json({error:err},400)}

    const temp=`CLI-PENDING-${crypto.randomUUID()}`;
    const {data:p,error:pe}=await db.from('party').insert({company_id:companyId,code:temp,legal_name:legalName,trade_name:tradeName||null,tax_id:taxId,email:email||null,phone:phone||null}).select('*').single();
    if(pe)throw pe;
    const {data:customer,error:ce}=await db.from('customer').insert({party_id:p.id}).select('id').single();
    if(ce)throw ce;
    const generatedCode=`CLI-${String(customer.id).padStart(6,'0')}`;
    const {error:codeError}=await db.from('party').update({code:generatedCode,updated_at:new Date().toISOString()}).eq('company_id',companyId).eq('id',p.id);
    if(codeError)throw codeError;
    const {error:re}=await db.from('party_role').insert({party_id:p.id,role_code:'CUSTOMER'});if(re)throw re;
    if(body.address){const {error:ae}=await db.from('address').upsert({party_id:p.id,address_type:'ACTIVITY',street:normalize(body.address.street)||null,postal_code:normalize(body.address.postal_code)||null,city:normalize(body.address.city)||null,region:normalize(body.address.region)||null,country_code:normalize(body.address.country_code)||null},{onConflict:'party_id,address_type'});if(ae)throw ae}
    if(Array.isArray(body.contacts)&&body.contacts.length){const rows=body.contacts.map(c=>({party_id:p.id,first_name:normalize(c.first_name)||null,last_name:normalize(c.last_name)||null,job_title:normalize(c.job_title)||null,department:normalize(c.department)||null,phone:normalize(c.phone)||null,mobile:normalize(c.mobile)||null,email:normalize(c.email)||null,notes:normalize(c.notes)||null,active:true}));const {error:e}=await db.from('contact').insert(rows);if(e)throw e}
    return json(await getCustomerById(db,customer.id),201);
  }

  if(subresource==='contacts'){
    const current=await getCustomerById(db,customerId);if(!current)return json({error:'Customer not found'},404);
    if(req.method==='GET'&&subId===null)return json(current.contacts||[]);
    const partyId=current.party_id;
    if(req.method==='POST'&&subId===null){const body:ContactInput=await req.json(),err=validateContact(body);if(err)return json({error:err},400);const {data,error}=await db.from('contact').insert({party_id:partyId,first_name:normalize(body.first_name)||null,last_name:normalize(body.last_name)||null,job_title:normalize(body.job_title)||null,department:normalize(body.department)||null,phone:normalize(body.phone)||null,mobile:normalize(body.mobile)||null,email:normalize(body.email)||null,notes:normalize(body.notes)||null,active:true}).select('*').single();if(error)throw error;return json(toContact(data),201)}
    if((req.method==='PUT'||req.method==='DELETE')&&subId!==null){const existing=await db.from('contact').select('*').eq('id',subId).eq('party_id',partyId).maybeSingle();if(existing.error||!existing.data)return json({error:'Contact not found'},404);if(req.method==='PUT'){const body:ContactInput=await req.json(),err=validateContact(body);if(err)return json({error:err},400);const {data,error}=await db.from('contact').update({first_name:normalize(body.first_name)||null,last_name:normalize(body.last_name)||null,job_title:normalize(body.job_title)||null,department:normalize(body.department)||null,phone:normalize(body.phone)||null,mobile:normalize(body.mobile)||null,email:normalize(body.email)||null,notes:normalize(body.notes)||null}).eq('id',subId).eq('party_id',partyId).select('*').single();if(error)throw error;return json(toContact(data))}const {error}=await db.from('contact').delete().eq('id',subId).eq('party_id',partyId);if(error)throw error;return new Response(null,{status:204,headers:cors})}
    return json({error:'Method not allowed'},405);
  }

  if(req.method==='GET'){const out=await getCustomerById(db,customerId);return out?json(out):json({error:'Customer not found'},404)}
  if(req.method==='PUT'){
    const current=await getCustomerById(db,customerId);if(!current)return json({error:'Customer not found'},404);
    const body:CustomerInput=await req.json(),legalName=normalize(body.legal_name) as string|undefined,tradeName=normalize(body.trade_name) as string|undefined,taxId=normalize(body.tax_id) as string|undefined,email=normalize(body.email) as string|undefined,phone=normalize(body.phone) as string|undefined;
    if(!legalName)return json({error:'El nombre fiscal es obligatorio.'},400);if(!taxId)return json({error:'CIF / NIF es obligatorio.'},400);if(!validSpanishTaxId(taxId))return json({error:'El CIF / NIF no es válido.'},400);if(email&&!validEmail(email))return json({error:'El e-mail no tiene un formato válido.'},400);if(phone&&!validPhone(phone))return json({error:'El teléfono no tiene un formato válido.'},400);
    const {error}=await db.from('party').update({legal_name:legalName,trade_name:tradeName||null,tax_id:taxId,email:email||null,phone:phone||null,updated_at:new Date().toISOString()}).eq('company_id',companyId).eq('id',current.party_id);if(error)throw error;
    if(body.address){const {error:ae}=await db.from('address').upsert({party_id:current.party_id,address_type:'ACTIVITY',street:normalize(body.address.street)||null,postal_code:normalize(body.address.postal_code)||null,city:normalize(body.address.city)||null,region:normalize(body.address.region)||null,country_code:normalize(body.address.country_code)||null},{onConflict:'party_id,address_type'});if(ae)throw ae}
    return json(await getCustomerById(db,customerId));
  }
  if(req.method==='DELETE'){
    const current=await getCustomerById(db,customerId);if(!current)return json({error:'Customer not found'},404);
    await db.from('party_role').delete().eq('party_id',current.party_id).eq('role_code','CUSTOMER');
    const {error}=await db.from('customer').delete().eq('id',customerId);if(error)throw error;
    const {error:pe}=await db.from('party').delete().eq('company_id',companyId).eq('id',current.party_id);if(pe)throw pe;
    return new Response(null,{status:204,headers:cors});
  }
  return json({error:'Method not allowed'},405);
}

Deno.serve(req=>main(req).catch(e=>{if(e instanceof Response)return e;console.error(e);return json({error:e?.message||'Internal server error'},500)}));
