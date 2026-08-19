import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { markForDeletion, restoreFromDeletion } from '../core/softDeleteRepository';

export type CatalogKind = 'families'|'types'|'units'|'magnitudes'|'colors'|'attributes'|'lineBehaviors';
export type CatalogRow = {
  id:number; company_id:number; code:string; name:string; active:boolean; deleted_at?:string|null;
  confectionable?:boolean; recuttable?:boolean; minimum_remainder?:number|null;
  product_type_id?:number|null; line_behavior_id?:number|null;
  data_type?:string; description?:string|null;
  quantity_enabled?:boolean; price_enabled?:boolean; discount_enabled?:boolean; dimensions_enabled?:boolean;
  configuration_enabled?:boolean; cut_calculation_enabled?:boolean; length_enabled?:boolean;
  characteristics_enabled?:boolean; canvas_cut_enabled?:boolean;
};
export type AttributeValue = { id:number; attribute_id:number; code:string; name:string; active:boolean; deleted_at?:string|null; sort_order:number };

type CatalogInput = {
  id?:number; code:string; name:string; active:boolean; description?:string|null;
  confectionable?:boolean; recuttable?:boolean; minimum_remainder?:number|null;
  product_type_id?:number|null; line_behavior_id?:number|null;
  quantity_enabled?:boolean; price_enabled?:boolean; discount_enabled?:boolean; dimensions_enabled?:boolean;
  configuration_enabled?:boolean; cut_calculation_enabled?:boolean; length_enabled?:boolean;
  characteristics_enabled?:boolean; canvas_cut_enabled?:boolean; data_type?:string;
};

function client(){
  if(!supabase) throw new CoreRepositoryError('Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  return supabase;
}
const tableFor:Record<CatalogKind,string> = {
  families:'product_family',types:'product_type',units:'unit',magnitudes:'magnitude',colors:'color',attributes:'product_attribute',
  lineBehaviors:'product_line_behavior'
};

export async function listCatalog(kind:CatalogKind, companyId:number, search='',state:'active'|'inactive'|'deleted'|'all'='active'):Promise<CatalogRow[]>{
  const c=client(); let q=c.from(tableFor[kind]).select('*').eq('company_id',companyId).order('code');
  if(state==='active') q=q.eq('active',true).is('deleted_at',null);
  if(state==='inactive') q=q.eq('active',false).is('deleted_at',null);
  if(state==='deleted') q=q.not('deleted_at','is',null);
  if(state==='all') q=q.order('deleted_at',{ascending:true,nullsFirst:true});
  const term=search.trim().replace(/[%_]/g,''); if(term) q=q.or(`code.ilike.%${term}%,${kind==='types'?'description':'name'}.ilike.%${term}%`);
  const {data,error}=await q; if(error) throw new CoreRepositoryError(error.message);
  return ((data??[]) as CatalogRow[]).map(row=>({...row,name:kind==='types'?String(row.description??''):row.name}));
}

export async function upsertCatalog(kind:CatalogKind,companyId:number,input:CatalogInput):Promise<void>{
 const c=client(); const base:any={company_id:companyId,code:input.code.trim(),active:input.active,deleted_at:null,deleted_by:null};
 if(kind==='types') base.description=input.name.trim(); else base.name=input.name.trim();
 if(kind==='families') {
   base.confectionable=!!input.confectionable;
   base.recuttable=!!input.recuttable;
   base.minimum_remainder=input.minimum_remainder??null;
   base.product_type_id=input.product_type_id??null;
   base.line_behavior_id=input.line_behavior_id??null;
 }
 if(kind==='lineBehaviors') {
   base.description=input.description?.trim()||null;
   base.quantity_enabled=!!input.quantity_enabled;
   base.price_enabled=!!input.price_enabled;
   base.discount_enabled=!!input.discount_enabled;
   base.dimensions_enabled=!!input.dimensions_enabled;
   base.configuration_enabled=!!input.configuration_enabled;
   base.cut_calculation_enabled=!!input.cut_calculation_enabled;
   base.length_enabled=!!input.length_enabled;
   base.characteristics_enabled=!!input.characteristics_enabled;
   base.canvas_cut_enabled=!!input.canvas_cut_enabled;
 }
 if(kind==='attributes') base.data_type=input.data_type??'TEXT';
 const q=input.id?c.from(tableFor[kind]).update(base).eq('id',input.id):c.from(tableFor[kind]).insert(base); const {error}=await q; if(error)throw new CoreRepositoryError(error.message);
}
export async function markCatalogForDeletion(kind:CatalogKind,id:number):Promise<void>{await markForDeletion(tableFor[kind],id);}
export async function restoreCatalog(kind:CatalogKind,id:number):Promise<void>{await restoreFromDeletion(tableFor[kind],id);}
export async function listAttributeValues(attributeId:number,state:'active'|'inactive'|'deleted'|'all'='active'):Promise<AttributeValue[]>{
 const c=client(); let q=c.from('product_attribute_value').select('id,attribute_id,code,name,active,deleted_at,sort_order').eq('attribute_id',attributeId).order('sort_order').order('code');
 if(state==='active')q=q.eq('active',true).is('deleted_at',null);if(state==='inactive')q=q.eq('active',false).is('deleted_at',null);if(state==='deleted')q=q.not('deleted_at','is',null);if(state==='all')q=q.order('deleted_at',{ascending:true,nullsFirst:true});
 const {data,error}=await q;if(error)throw new CoreRepositoryError(error.message);return(data??[]) as AttributeValue[];
}
export async function upsertAttributeValue(input:{id?:number;attribute_id:number;code:string;name:string;active:boolean;sort_order:number}):Promise<void>{const c=client();const payload={attribute_id:input.attribute_id,code:input.code.trim(),name:input.name.trim(),active:input.active,sort_order:input.sort_order,deleted_at:null,deleted_by:null};const q=input.id?c.from('product_attribute_value').update(payload).eq('id',input.id):c.from('product_attribute_value').insert(payload);const {error}=await q;if(error)throw new CoreRepositoryError(error.message)}
export async function markAttributeValueForDeletion(id:number):Promise<void>{await markForDeletion('product_attribute_value',id)}
export async function restoreAttributeValue(id:number):Promise<void>{await restoreFromDeletion('product_attribute_value',id)}
