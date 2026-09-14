import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { markForDeletion, restoreFromDeletion } from '../core/softDeleteRepository';
import { sanitizeSearchTerm } from '../core/searchSanitize';

export type CatalogKind = 'families' | 'types' | 'units' | 'magnitudes' | 'colors' | 'attributes' | 'mountingTypes' | 'lineBehaviors';
export type FallbackProfileEstimate = { code:string; name:string; end_deduction_mm:number; color?:string };
export type CatalogRow = {
  id:number; company_id:number; code:string; name:string; active:boolean; deleted_at?:string|null;
  confectionable?:boolean; recuttable?:boolean; minimum_remainder?:number|null;
  product_type_id?:number|null; measurement_type_id?:number|null; mounting_type_id?:number|null; line_behavior_id?:number|null;
  description?:string|null;
  quantity_enabled?:boolean; price_enabled?:boolean; discount_enabled?:boolean; dimensions_enabled?:boolean;
  configuration_enabled?:boolean; characteristics_enabled?:boolean;
  // Parámetros de corte de una línea de comportamiento. Todos opcionales: si son
  // null/undefined, cutCalculationService usa los valores históricos de toldo
  // enrollable (ver sus constantes DEFAULT_*).
  roll_width_m?:number|null; seam_allowance_width_m?:number|null; seam_allowance_height_m?:number|null;
  standard_bar_length_mm?:number|null; fallback_profile_estimates?:FallbackProfileEstimate[]|null;
};

type CatalogInput = {
  id?:number; code:string; name:string; active:boolean; description?:string|null;
  confectionable?:boolean; recuttable?:boolean; minimum_remainder?:number|null;
  product_type_id?:number|null; measurement_type_id?:number|null; mounting_type_id?:number|null; line_behavior_id?:number|null;
  quantity_enabled?:boolean; price_enabled?:boolean; discount_enabled?:boolean; dimensions_enabled?:boolean;
  configuration_enabled?:boolean; characteristics_enabled?:boolean;
  roll_width_m?:number|null; seam_allowance_width_m?:number|null; seam_allowance_height_m?:number|null;
  standard_bar_length_mm?:number|null; fallback_profile_estimates?:FallbackProfileEstimate[]|null;
};

function client(){
  if(!supabase) throw new CoreRepositoryError('Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  return supabase;
}
const tableFor:Record<CatalogKind,string> = {
  families:'product_family',types:'product_type',units:'unit',magnitudes:'magnitude',colors:'color',attributes:'product_attribute',
  mountingTypes:'product_mounting_type',lineBehaviors:'product_line_behavior'
};

export async function listCatalog(kind:CatalogKind, companyId:number, search='',state:'active'|'inactive'|'deleted'|'all'='active'):Promise<CatalogRow[]>{
  const c=client(); let q=c.from(tableFor[kind]).select('*').eq('company_id',companyId).order('code');
  if(state==='active') q=q.eq('active',true).is('deleted_at',null);
  if(state==='inactive') q=q.eq('active',false).is('deleted_at',null);
  if(state==='deleted') q=q.not('deleted_at','is',null);
  if(state==='all') q=q.order('deleted_at',{ascending:true,nullsFirst:true});
  const term=sanitizeSearchTerm(search); if(term) q=q.or(`code.ilike.%${term}%,${kind==='types'?'description':'name'}.ilike.%${term}%`);
  const {data,error}=await q; if(error) throw new CoreRepositoryError(error.message);
  return ((data??[]) as CatalogRow[]).map(row=>({...row,name:kind==='types'?String(row.description??''):row.name}));
}

export async function upsertCatalog(kind:CatalogKind,companyId:number,input:CatalogInput):Promise<CatalogRow|null>{
 const c=client(); const base:any={company_id:companyId,code:input.code.trim(),active:input.active,deleted_at:null,deleted_by:null};
 if(kind==='types') base.description=input.name.trim(); else base.name=input.name.trim();
 if(kind==='families') {
   base.confectionable=!!input.confectionable;
   base.recuttable=!!input.recuttable;
   base.minimum_remainder=(input.confectionable || input.recuttable) ? (input.minimum_remainder??null) : null;
   base.product_type_id=input.product_type_id??null;
   base.measurement_type_id=input.measurement_type_id??null;
   base.mounting_type_id=input.mounting_type_id??null;
   base.line_behavior_id=input.line_behavior_id??null;
 }
 if(kind==='lineBehaviors') {
   base.description=input.description?.trim()||null;
   base.quantity_enabled=!!input.quantity_enabled;
   base.price_enabled=!!input.price_enabled;
   base.discount_enabled=!!input.discount_enabled;
   base.dimensions_enabled=!!input.dimensions_enabled;
   base.configuration_enabled=!!input.configuration_enabled;
   base.characteristics_enabled=!!input.characteristics_enabled;
   base.roll_width_m=input.roll_width_m??null;
   base.seam_allowance_width_m=input.seam_allowance_width_m??null;
   base.seam_allowance_height_m=input.seam_allowance_height_m??null;
   base.standard_bar_length_mm=input.standard_bar_length_mm??null;
   base.fallback_profile_estimates=input.fallback_profile_estimates===undefined?null:input.fallback_profile_estimates;
 }
 let q=input.id?c.from(tableFor[kind]).update(base).eq('id',input.id).select().maybeSingle():c.from(tableFor[kind]).insert(base).select().maybeSingle();
 let res=await q;
 if(res.error && kind==='families' && res.error.message?.includes('measurement_type_id')) {
   delete base.measurement_type_id;
   q=input.id?c.from(tableFor[kind]).update(base).eq('id',input.id).select().maybeSingle():c.from(tableFor[kind]).insert(base).select().maybeSingle();
   res=await q;
 }
 if(res.error)throw new CoreRepositoryError(res.error.message);
 return res.data as CatalogRow | null;
}
export async function getCatalogRow(kind:CatalogKind,id:number):Promise<CatalogRow|null>{
 const c=client();
 const {data,error}=await c.from(tableFor[kind]).select('*').eq('id',id).maybeSingle();
 if(error)throw new CoreRepositoryError(error.message);
 if(!data)return null;
 const row=data as CatalogRow;
 return {...row,name:kind==='types'?String((row as any).description??''):row.name};
}
export async function markCatalogForDeletion(kind:CatalogKind,id:number):Promise<void>{await markForDeletion(tableFor[kind],id);}
export async function restoreCatalog(kind:CatalogKind,id:number):Promise<void>{await restoreFromDeletion(tableFor[kind],id);}
