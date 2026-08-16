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
export type ProductForm = Omit<Product,'id'|'company_id'>;
export type ProductListRow = Product & { family:ProductCatalogRef|null; productType:ProductTypeRef|null; unit:ProductCatalogRef|null; supplier:ProductSupplierRef|null };
export type ProductCharacteristic = {
  id:number; product_id:number; code:string; description:string|null; upc:number|null; ptc:number|null; pvp:number|null;
  price_increment:number; stock_minimum:number; active:boolean; scaled:boolean; deleted_at:string|null; deleted_by:string|null;
};

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
  q=q.not('usage_status','eq','DRAFT');
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

export async function createProductDraft(companyId:number):Promise<number>{
  const draftCode=`__DRAFT__${Date.now()}_${Math.floor(Math.random()*100000)}`;
  const input:ProductForm={
    code:draftCode,technical_description:'',commercial_description:'',family_id:null,product_type_id:null,base_unit_id:null,
    sales_price:null,purchase_price:null,stock_enabled:false,allow_negative_stock:false,active:true,notes:'',cod_arb:null,
    price_increment:0,upc:0,ptc:0,stock_minimum:0,discarded_size:null,minimum_remainder:null,smooth_cut:false,monochrome:false,
    usage_status:'DRAFT',iva_percent:null,default_supplier_party_id:null,include_measurements_in_stock:false,include_stock_by_color:false,
    scaled:false,scaled_by_characteristic:false,deleted_at:null,deleted_by:null,
  };
  return createProduct(companyId,input);
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

export async function listProductCharacteristics(productId:number,status:ProductStatus='active'):Promise<ProductCharacteristic[]>{
  const c=client(); let q=c.from('product_characteristic').select('id,product_id,code,description,upc,ptc,pvp,price_increment,stock_minimum,active,scaled,deleted_at,deleted_by').eq('product_id',productId).order('code');
  if(status==='active')q=q.eq('active',true).is('deleted_at',null);
  if(status==='inactive')q=q.eq('active',false).is('deleted_at',null);
  if(status==='deleted')q=q.not('deleted_at','is',null);
  const {data,error}=await q;if(error)throw new CoreRepositoryError(error.message);return(data??[]) as ProductCharacteristic[];
}

export async function createProductCharacteristic(productId:number,input:Omit<ProductCharacteristic,'id'|'product_id'|'deleted_at'|'deleted_by'>):Promise<number>{
  const c=client();const {data,error}=await c.from('product_characteristic').insert({product_id:productId,...input,deleted_at:null,deleted_by:null}).select('id').single();if(error)throw new CoreRepositoryError(error.message);return Number(data.id);
}

export async function updateProductCharacteristic(id:number,input:Partial<Omit<ProductCharacteristic,'id'|'product_id'>>):Promise<void>{
  const c=client();const {error}=await c.from('product_characteristic').update(input).eq('id',id).is('deleted_at',null);if(error)throw new CoreRepositoryError(error.message);
}

export async function markProductCharacteristicForDeletion(id:number):Promise<void>{
  const c=client();const {data:user}=await c.auth.getUser();const {error}=await c.from('product_characteristic').update({active:false,deleted_at:new Date().toISOString(),deleted_by:user.user?.id??null}).eq('id',id).is('deleted_at',null);if(error)throw new CoreRepositoryError(error.message);
}

export async function restoreProductCharacteristic(id:number):Promise<void>{
  const c=client();const {error}=await c.from('product_characteristic').update({active:true,deleted_at:null,deleted_by:null}).eq('id',id).not('deleted_at','is',null);if(error)throw new CoreRepositoryError(error.message);
}
