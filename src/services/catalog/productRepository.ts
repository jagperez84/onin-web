import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type ProductStatus = 'active' | 'inactive' | 'deleted' | 'all';
export type ProductCatalogRef = { id:number; code:string; name:string };
export type ProductTypeRef = { id:number; code:string; name:string };
export type ProductSupplierRef = { id:number; name:string };
export type Product = {
  id:number; company_id:number; code:string; technical_description:string|null; commercial_description:string|null;
  family_id:number|null; product_type_id:number|null; base_unit_id:number|null;
  sales_price:number|null; purchase_price:number|null; stock_enabled:boolean; allow_negative_stock:boolean;
  active:boolean; notes:string|null; cod_arb:string|null; price_increment:number; upc:number; ptc:number; stock_minimum:number;
  discarded_size:number|null; minimum_remainder:number|null; smooth_cut:boolean; monochrome:boolean; usage_status:string;
  iva_percent:number|null; default_supplier_party_id:number|null; include_measurements_in_stock:boolean; include_stock_by_color:boolean;
  scaled:boolean; scaled_by_characteristic:boolean; deleted_at:string|null; deleted_by:string|null;
};
export type ProductForm = Omit<Product,'id'|'company_id'|'created_at'|'updated_at'>;
export type ProductListRow = Product & { family:ProductCatalogRef|null; productType:ProductTypeRef|null; unit:ProductCatalogRef|null; supplier:ProductSupplierRef|null };

function client(){ if(!supabase) throw new CoreRepositoryError('Supabase no está configurado.'); return supabase; }

async function refs(companyId:number){
  const c=client();
  const [f,t,u,s]=await Promise.all([
    c.from('product_family').select('id,code,name').eq('company_id',companyId).eq('active',true).is('deleted_at',null).order('code'),
    c.from('product_type').select('id,code,description').eq('company_id',companyId).eq('active',true).is('deleted_at',null).order('code'),
    c.from('unit').select('id,code,name').eq('company_id',companyId).eq('active',true).is('deleted_at',null).order('code'),
    c.from('party_role').select('party_id').eq('role_code','SUPPLIER').eq('active',true),
  ]);
  for(const r of [f,t,u,s]) if(r.error) throw new CoreRepositoryError(r.error.message);
  const supplierIds=((s.data??[]) as {party_id:number}[]).map(x=>x.party_id);
  let suppliers:{id:number;legal_name:string;trade_name:string|null}[]=[];
  if(supplierIds.length){ const q=await c.from('party').select('id,legal_name,trade_name').in('id',supplierIds).eq('active',true); if(q.error) throw new CoreRepositoryError(q.error.message); suppliers=(q.data??[]) as typeof suppliers; }
  return {
    families:(f.data??[]) as ProductCatalogRef[],
    types:(t.data??[]).map((x:any)=>({id:x.id,code:x.code,name:x.description})) as ProductTypeRef[],
    units:(u.data??[]) as ProductCatalogRef[],
    suppliers:suppliers.map(x=>({id:x.id,name:x.trade_name||x.legal_name})) as ProductSupplierRef[],
  };
}

export async function getProductReferences(companyId:number){ return refs(companyId); }

export async function listProducts(companyId:number,search='',status:ProductStatus='active'):Promise<ProductListRow[]>{
  const c=client();
  let q=c.from('product').select('*').eq('company_id',companyId).order('code');
  if(status==='active') q=q.eq('active',true).is('deleted_at',null);
  if(status==='inactive') q=q.eq('active',false).is('deleted_at',null);
  if(status==='deleted') q=q.not('deleted_at','is',null);
  const term=search.trim().replace(/[%_]/g,'');
  if(term) q=q.or(`code.ilike.%${term}%,technical_description.ilike.%${term}%,commercial_description.ilike.%${term}%`);
  const {data,error}=await q; if(error) throw new CoreRepositoryError(error.message);
  const references=await refs(companyId);
  return ((data??[]) as Product[]).map(p=>({
    ...p,
    family:references.families.find(x=>x.id===p.family_id)??null,
    productType:references.types.find(x=>x.id===p.product_type_id)??null,
    unit:references.units.find(x=>x.id===p.base_unit_id)??null,
    supplier:references.suppliers.find(x=>x.id===p.default_supplier_party_id)??null,
  }));
}

export async function getProduct(companyId:number,id:number):Promise<{product:Product;references:Awaited<ReturnType<typeof refs>>}>{
  const c=client(); const {data,error}=await c.from('product').select('*').eq('company_id',companyId).eq('id',id).single(); if(error) throw new CoreRepositoryError(error.message); return {product:data as Product,references:await refs(companyId)};
}

export async function createProduct(companyId:number,input:ProductForm):Promise<number>{
  const c=client(); const {data,error}=await c.from('product').insert({company_id:companyId,...input,deleted_at:null,deleted_by:null}).select('id').single(); if(error) throw new CoreRepositoryError(error.message); return Number(data.id);
}
export async function updateProduct(companyId:number,id:number,input:ProductForm):Promise<void>{
  const c=client(); const {error}=await c.from('product').update(input).eq('company_id',companyId).eq('id',id).is('deleted_at',null); if(error) throw new CoreRepositoryError(error.message);
}
export async function markProductForDeletion(companyId:number,id:number):Promise<void>{
  const c=client(); const {data:user}=await c.auth.getUser(); const {error}=await c.from('product').update({active:false,deleted_at:new Date().toISOString(),deleted_by:user.user?.id??null}).eq('company_id',companyId).eq('id',id).is('deleted_at',null); if(error) throw new CoreRepositoryError(error.message);
}
export async function restoreProduct(companyId:number,id:number):Promise<void>{
  const c=client(); const {error}=await c.from('product').update({active:true,deleted_at:null,deleted_by:null}).eq('company_id',companyId).eq('id',id).not('deleted_at','is',null); if(error) throw new CoreRepositoryError(error.message);
}
