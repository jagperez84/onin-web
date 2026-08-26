import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type ProductAttributeRef={id:number;code:string;name:string;data_type:string};
export type ProductAttributeAssignment=ProductAttributeRef&{assignment_id:number;attribute_id:number;required:boolean;sort_order:number;active:boolean;deleted_at:string|null};
export type ProductCharacteristicConfiguration=ProductAttributeRef&{assignment_id:number;attribute_id:number;product_id:number;required:boolean;sort_order:number;active:boolean;deleted_at:string|null;source:'family'|'article';excluded:boolean};

function client(){if(!supabase)throw new CoreRepositoryError('Supabase no está configurado.');return supabase;}
function attributeOf(value:any):any{return Array.isArray(value)?value[0]??null:value??null;}

export async function listProductAttributeAssignments(productId:number):Promise<ProductAttributeAssignment[]>{
 const c=client();
 const {data,error}=await c.from('product_attribute_assignment').select('id,attribute_id,required,sort_order,active,deleted_at,product_attribute!inner(id,code,name,data_type)').eq('product_id',productId).is('deleted_at',null).order('sort_order').order('attribute_id');
 if(error)throw new CoreRepositoryError(error.message);
 return(data??[]).map((r:any)=>{const attr=attributeOf(r.product_attribute);return{assignment_id:Number(r.id),attribute_id:Number(r.attribute_id),id:Number(attr?.id??r.attribute_id),code:String(attr?.code??''),name:String(attr?.name??''),data_type:String(attr?.data_type??'TEXT'),required:!!r.required,sort_order:Number(r.sort_order??0),active:!!r.active,deleted_at:r.deleted_at??null};});
}

export async function listProductCharacteristicConfiguration(productId:number):Promise<ProductCharacteristicConfiguration[]>{
 const c=client();
 const productRes=await c.from('product').select('family_id').eq('id',productId).single();
 if(productRes.error)throw new CoreRepositoryError(productRes.error.message);
 const familyId=productRes.data?.family_id==null?null:Number(productRes.data.family_id);
 const [familyRes,productRes2,exclusionRes]=await Promise.all([
  familyId?c.from('product_family_attribute').select('id,attribute_id,required,sort_order,active,deleted_at,product_attribute!inner(id,code,name,data_type)').eq('family_id',familyId).eq('active',true).is('deleted_at',null).order('sort_order').order('attribute_id'):Promise.resolve({data:[],error:null} as any),
  c.from('product_attribute_assignment').select('id,attribute_id,required,sort_order,active,deleted_at,product_attribute!inner(id,code,name,data_type)').eq('product_id',productId).eq('active',true).is('deleted_at',null).order('sort_order').order('attribute_id'),
  c.from('product_family_attribute_exclusion').select('attribute_id').eq('product_id',productId)
 ]);
 if(familyRes.error)throw new CoreRepositoryError(familyRes.error.message);
 if(productRes2.error)throw new CoreRepositoryError(productRes2.error.message);
 if(exclusionRes.error)throw new CoreRepositoryError(exclusionRes.error.message);
 const excluded=new Set((exclusionRes.data??[]).map((x:any)=>Number(x.attribute_id)));
 const effective=new Map<number,ProductCharacteristicConfiguration>();
 for(const r of familyRes.data??[]){const attr=attributeOf((r as any).product_attribute);const id=Number((r as any).attribute_id);effective.set(id,{assignment_id:Number((r as any).id),attribute_id:id,product_id:productId,id:Number(attr?.id??id),code:String(attr?.code??''),name:String(attr?.name??''),data_type:String(attr?.data_type??'TEXT'),required:!!(r as any).required,sort_order:Number((r as any).sort_order??0),active:!!(r as any).active,deleted_at:(r as any).deleted_at??null,source:'family',excluded:excluded.has(id)});}
 for(const r of productRes2.data??[]){const attr=attributeOf((r as any).product_attribute);const id=Number((r as any).attribute_id);effective.set(id,{assignment_id:Number((r as any).id),attribute_id:id,product_id:productId,id:Number(attr?.id??id),code:String(attr?.code??''),name:String(attr?.name??''),data_type:String(attr?.data_type??'TEXT'),required:!!(r as any).required,sort_order:Number((r as any).sort_order??0),active:!!(r as any).active,deleted_at:(r as any).deleted_at??null,source:'article',excluded:false});}
 return [...effective.values()].sort((a,b)=>a.sort_order-b.sort_order||a.code.localeCompare(b.code));
}

export async function listAvailableProductAttributes(companyId:number,productId:number):Promise<ProductAttributeRef[]>{const c=client();const [attrs,effective]=await Promise.all([c.from('product_attribute').select('id,code,name,data_type').eq('company_id',companyId).eq('active',true).is('deleted_at',null).order('code'),listProductCharacteristicConfiguration(productId)]);if(attrs.error)throw new CoreRepositoryError(attrs.error.message);const ids=new Set(effective.filter(x=>!x.excluded).map(x=>x.attribute_id));return((attrs.data??[])as ProductAttributeRef[]).filter(x=>!ids.has(x.id));}
export async function assignProductAttribute(productId:number,attributeId:number,required=false,sortOrder=0):Promise<void>{const c=client();const {error}=await c.from('product_attribute_assignment').upsert({product_id:productId,attribute_id:attributeId,required,sort_order:sortOrder,active:true,deleted_at:null,deleted_by:null},{onConflict:'product_id,attribute_id'});if(error)throw new CoreRepositoryError(error.message);}
export async function updateProductAttributeAssignment(id:number,input:{required?:boolean;sort_order?:number;active?:boolean}):Promise<void>{const c=client();const {error}=await c.from('product_attribute_assignment').update(input).eq('id',id).is('deleted_at',null);if(error)throw new CoreRepositoryError(error.message);}
export async function removeProductAttributeAssignment(id:number):Promise<void>{const c=client();const {data:user}=await c.auth.getUser();const {error}=await c.from('product_attribute_assignment').update({active:false,deleted_at:new Date().toISOString(),deleted_by:user.user?.id??null}).eq('id',id).is('deleted_at',null);if(error)throw new CoreRepositoryError(error.message);}
export async function removeProductCharacteristicConfiguration(row:ProductCharacteristicConfiguration):Promise<void>{const c=client();if(row.source==='family'){const {error}=await c.from('product_family_attribute_exclusion').upsert({product_id:row.product_id,attribute_id:row.attribute_id},{onConflict:'product_id,attribute_id'});if(error)throw new CoreRepositoryError(error.message);return;}await removeProductAttributeAssignment(row.assignment_id);}
export async function restoreProductCharacteristicConfiguration(row:ProductCharacteristicConfiguration):Promise<void>{const c=client();if(row.source==='family'){const {error}=await c.from('product_family_attribute_exclusion').delete().eq('product_id',row.product_id).eq('attribute_id',row.attribute_id);if(error)throw new CoreRepositoryError(error.message);return;}const {error}=await c.from('product_attribute_assignment').update({active:true,deleted_at:null,deleted_by:null}).eq('id',row.assignment_id);if(error)throw new CoreRepositoryError(error.message);}
