import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type CatalogKind = 'families' | 'types' | 'units' | 'magnitudes' | 'colors' | 'attributes';
export type CatalogRow = { id:number; company_id:number; code:string; name:string; active:boolean; confectionable?:boolean; data_type?:string };
export type AttributeValue = { id:number; attribute_id:number; code:string; name:string; active:boolean; sort_order:number };

function client(){
  if(!supabase) throw new CoreRepositoryError('Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

const tableFor:Record<CatalogKind,string> = {
  families:'product_family',
  types:'product_type',
  units:'unit',
  magnitudes:'magnitude',
  colors:'color',
  attributes:'product_attribute',
};

export async function listCatalog(kind:CatalogKind, companyId:number, search=''):Promise<CatalogRow[]>{
  const c=client();
  let q=c.from(tableFor[kind]).select('*').eq('company_id',companyId).order('code');
  const term=search.trim().replace(/[%_]/g,'');
  if(term) q=q.or(`code.ilike.%${term}%,${kind==='types'?'description':'name'}.ilike.%${term}%`);
  const {data,error}=await q;
  if(error) throw new CoreRepositoryError(error.message);
  return ((data??[]) as CatalogRow[]).map(row=>({ ...row, name: kind==='types' ? String((row as CatalogRow & {description?:string}).description ?? '') : row.name }));
}

export async function upsertCatalog(kind:CatalogKind, companyId:number, input:{id?:number;code:string;name:string;active:boolean;confectionable?:boolean;data_type?:string}):Promise<void>{
  const c=client();
  const base:any={company_id:companyId,code:input.code.trim(),active:input.active};
  if(kind==='types') base.description=input.name.trim(); else base.name=input.name.trim();
  if(kind==='families') base.confectionable=!!input.confectionable;
  if(kind==='attributes') base.data_type=input.data_type ?? 'TEXT';
  const q=input.id ? c.from(tableFor[kind]).update(base).eq('id',input.id) : c.from(tableFor[kind]).insert(base);
  const {error}=await q;
  if(error) throw new CoreRepositoryError(error.message);
}

export async function listAttributeValues(attributeId:number):Promise<AttributeValue[]>{
  const c=client(); const {data,error}=await c.from('product_attribute_value').select('id,attribute_id,code,name,active,sort_order').eq('attribute_id',attributeId).order('sort_order').order('code');
  if(error) throw new CoreRepositoryError(error.message); return (data??[]) as AttributeValue[];
}

export async function upsertAttributeValue(input:{id?:number;attribute_id:number;code:string;name:string;active:boolean;sort_order:number}):Promise<void>{
  const c=client(); const payload={attribute_id:input.attribute_id,code:input.code.trim(),name:input.name.trim(),active:input.active,sort_order:input.sort_order};
  const q=input.id ? c.from('product_attribute_value').update(payload).eq('id',input.id) : c.from('product_attribute_value').insert(payload);
  const {error}=await q; if(error) throw new CoreRepositoryError(error.message);
}

export async function removeAttributeValue(id:number):Promise<void>{
  const c=client(); const {error}=await c.from('product_attribute_value').delete().eq('id',id); if(error) throw new CoreRepositoryError(error.message);
}
