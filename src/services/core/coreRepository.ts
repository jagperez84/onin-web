import { supabase } from '../../lib/supabase';
import type { Address, Company, Contact, Customer, CustomerSummary, Party } from '../../domain/core/types';

export class CoreRepositoryError extends Error {
  constructor(message: string) { super(message); this.name = 'CoreRepositoryError'; }
}

function requireClient(){
  if(!supabase) throw new CoreRepositoryError('Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

export async function getActiveCompanies():Promise<Company[]>{
  const client=requireClient();
  const {data,error}=await client.from('company').select('id,code,name,tax_id,active').eq('active',true).order('name');
  if(error) throw new CoreRepositoryError(error.message);
  return (data??[]) as Company[];
}

export async function getCustomerSummaries(search=''):Promise<CustomerSummary[]>{
  const client=requireClient();
  let query=client.from('customer').select('id,party_id,party!inner(id,code,legal_name,trade_name,tax_id,email,phone,active)').order('id');
  if(search.trim()){
    const q=search.trim().replace(/[%_]/g,'');
    query=query.or(`legal_name.ilike.%${q}%,trade_name.ilike.%${q}%,tax_id.ilike.%${q}%,code.ilike.%${q}%`,{referencedTable:'party'});
  }
  const {data,error}=await query;
  if(error) throw new CoreRepositoryError(error.message);
  return (data??[]) as unknown as CustomerSummary[];
}

export async function getPartyById(id:number):Promise<Party>{
  const client=requireClient(); const {data,error}=await client.from('party').select('id,company_id,code,legal_name,trade_name,tax_id,email,phone,active').eq('id',id).single();
  if(error) throw new CoreRepositoryError(error.message); return data as Party;
}
export async function getCustomerById(id:number):Promise<Customer>{
  const client=requireClient(); const {data,error}=await client.from('customer').select('id,party_id').eq('id',id).single();
  if(error) throw new CoreRepositoryError(error.message); return data as Customer;
}
export async function getUserDisplayName(userId:string|null):Promise<string|null>{
  if(!userId) return null;
  const client=requireClient();
  const {data,error}=await client.from('user_account').select('*').eq('id',userId).maybeSingle();
  if(error) throw new CoreRepositoryError(error.message);
  if(!data) return null;
  const row=data as Record<string,unknown>;
  for(const key of ['full_name','display_name','name','username']){const value=row[key];if(typeof value==='string'&&value.trim())return value.trim();}
  const first=typeof row.first_name==='string'?row.first_name.trim():'';
  const last=typeof row.last_name==='string'?row.last_name.trim():'';
  if(first||last)return `${first} ${last}`.trim();
  const email=typeof row.email==='string'?row.email.trim():'';
  return email||null;
}
export async function getAddresses(partyId:number):Promise<Address[]>{
  const client=requireClient(); const {data,error}=await client.from('address').select('*').eq('party_id',partyId).order('id');
  if(error) throw new CoreRepositoryError(error.message); return (data??[]) as Address[];
}
export async function getContacts(partyId:number):Promise<Contact[]>{
  const client=requireClient(); const {data,error}=await client.from('contact').select('*').eq('party_id',partyId).order('id');
  if(error) throw new CoreRepositoryError(error.message); return (data??[]) as Contact[];
}
export async function checkCoreConnectivity():Promise<{ok:boolean;companies:number;message:string}>{
  try{const companies=await getActiveCompanies();return {ok:true,companies:companies.length,message:'Conectado a Supabase y al modelo Core.'};}
  catch(error){return {ok:false,companies:0,message:error instanceof Error?error.message:'No se pudo comprobar la conexión.'};}
}
