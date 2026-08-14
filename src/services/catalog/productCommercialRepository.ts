import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type ProductSupplierRow = { id:number; product_id:number; supplier_party_id:number; supplier_code:string|null; price_type:string|null; price:number|null; discount_percent:number; active:boolean; characteristic_id:number|null; delivery_days:number|null; supplier_name:string; characteristic_code:string|null };
export type ProductScaleRow = { id:number; product_id:number; dimension_1:number; dimension_2:number|null; price:number; characteristic_id:number|null; characteristic_code:string|null; characteristic_description:string|null };
export type ProductSupplierInput = Omit<ProductSupplierRow,'id'|'product_id'|'supplier_name'|'characteristic_code'>;
export type ProductScaleInput = Omit<ProductScaleRow,'id'|'product_id'|'characteristic_code'|'characteristic_description'>;

function client(){if(!supabase)throw new CoreRepositoryError('Supabase no está configurado.');return supabase;}

export async function listProductSuppliers(productId:number):Promise<ProductSupplierRow[]>{
 const c=client();
 const {data,error}=await c.from('product_supplier').select('id,product_id,supplier_party_id,supplier_code,price_type,price,discount_percent,active,characteristic_id,delivery_days').eq('product_id',productId).order('active',{ascending:false}).order('id');
 if(error)throw new CoreRepositoryError(error.message);
 const rows=(data??[]) as Omit<ProductSupplierRow,'supplier_name'|'characteristic_code'>[];
 const ids=[...new Set(rows.map(r=>r.supplier_party_id))];
 const chars=[...new Set(rows.map(r=>r.characteristic_id).filter((v):v is number=>v!==null))];
 const [sup,chr]=await Promise.all([
   ids.length?c.from('party').select('id,legal_name,trade_name').in('id',ids):Promise.resolve({data:[],error:null} as any),
   chars.length?c.from('product_characteristic').select('id,code').in('id',chars):Promise.resolve({data:[],error:null} as any)
 ]);
 if(sup.error)throw new CoreRepositoryError(sup.error.message); if(chr.error)throw new CoreRepositoryError(chr.error.message);
 const names=new Map((sup.data??[]).map((x:any)=>[x.id,x.trade_name||x.legal_name]));
 const codes=new Map((chr.data??[]).map((x:any)=>[x.id,x.code]));
 return rows.map(r=>({...r,supplier_name:names.get(r.supplier_party_id)??`Proveedor ${r.supplier_party_id}`,characteristic_code:r.characteristic_id?codes.get(r.characteristic_id)??null:null}));
}

export async function listProductScales(productId:number):Promise<ProductScaleRow[]>{
 const c=client(); const {data,error}=await c.from('product_scale').select('id,product_id,dimension_1,dimension_2,price,characteristic_id').eq('product_id',productId).order('dimension_1').order('dimension_2');
 if(error)throw new CoreRepositoryError(error.message);
 const rows=(data??[]) as Omit<ProductScaleRow,'characteristic_code'|'characteristic_description'>[];
 const ids=[...new Set(rows.map(r=>r.characteristic_id).filter((v):v is number=>v!==null))];
 const chr=ids.length?await c.from('product_characteristic').select('id,code,description').in('id',ids):{data:[],error:null} as any;
 if(chr.error)throw new CoreRepositoryError(chr.error.message);
 const map=new Map((chr.data??[]).map((x:any)=>[x.id,x]));
 return rows.map(r=>({...r,characteristic_code:r.characteristic_id?map.get(r.characteristic_id)?.code??null:null,characteristic_description:r.characteristic_id?map.get(r.characteristic_id)?.description??null:null}));
}

export async function createProductSupplier(productId:number,input:ProductSupplierInput):Promise<void>{const c=client();const {error}=await c.from('product_supplier').insert({product_id:productId,...input});if(error)throw new CoreRepositoryError(error.message);}
export async function updateProductSupplier(id:number,input:Partial<ProductSupplierInput>):Promise<void>{const c=client();const {error}=await c.from('product_supplier').update(input).eq('id',id);if(error)throw new CoreRepositoryError(error.message);}
export async function createProductScale(productId:number,input:ProductScaleInput):Promise<void>{if(input.price<=0)throw new CoreRepositoryError('El precio del escalado debe ser mayor que 0.');const c=client();const {error}=await c.from('product_scale').insert({product_id:productId,...input});if(error)throw new CoreRepositoryError(error.message);}
export async function updateProductScale(id:number,input:ProductScaleInput):Promise<void>{if(input.price<=0)throw new CoreRepositoryError('El precio del escalado debe ser mayor que 0.');const c=client();const {error}=await c.from('product_scale').update(input).eq('id',id);if(error)throw new CoreRepositoryError(error.message);}
