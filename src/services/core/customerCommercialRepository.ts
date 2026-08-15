import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from './coreRepository';

export type DiscountFamilyRow = {
  id: number;
  customer_party_id: number;
  product_family_id: number;
  family_code: string;
  family_name: string;
  discount_percent: number;
  active: boolean;
  deleted_at: string | null;
};

export type DiscountProductRow = {
  id: number;
  customer_party_id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  family_name: string | null;
  discount_percent: number;
  active: boolean;
  deleted_at: string | null;
};

type EntityRef = { id: number; code: string; name: string };

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export async function listCustomerFamilyDiscounts(customerPartyId: number, includeDeleted = false): Promise<DiscountFamilyRow[]> {
  const c = client();
  let q = c.from('customer_family_discount')
    .select('id,customer_party_id,product_family_id,discount_percent,active,deleted_at,product_family!inner(code,name)')
    .eq('customer_party_id', customerPartyId)
    .order('id');
  if (!includeDeleted) q = q.is('deleted_at', null);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return ((data ?? []) as Array<{
    id:number; customer_party_id:number; product_family_id:number; discount_percent:number; active:boolean; deleted_at:string|null;
    product_family:{code:string;name:string};
  }>).map(r => ({
    id:r.id,
    customer_party_id:r.customer_party_id,
    product_family_id:r.product_family_id,
    family_code:r.product_family.code,
    family_name:r.product_family.name,
    discount_percent:Number(r.discount_percent),
    active:r.active,
    deleted_at:r.deleted_at,
  }));
}

export async function searchProductFamilies(companyId: number, search = ''): Promise<EntityRef[]> {
  const c = client();
  const term = search.trim().replace(/[%_]/g, '');
  let q = c.from('product_family').select('id,code,name').eq('company_id', companyId).eq('active', true).is('deleted_at', null).order('code').limit(12);
  if (term) q = q.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as EntityRef[];
}

export async function createCustomerFamilyDiscount(companyId:number, customerPartyId:number, productFamilyId:number, discountPercent:number):Promise<void>{
  const c = client();
  const { error } = await c.from('customer_family_discount').insert({company_id:companyId,customer_party_id:customerPartyId,product_family_id:productFamilyId,discount_percent:discountPercent,active:true,deleted_at:null,deleted_by:null});
  if (error) throw new CoreRepositoryError(error.message);
}

export async function updateCustomerFamilyDiscount(id:number, discountPercent:number):Promise<void>{
  const c = client();
  const { error } = await c.from('customer_family_discount').update({discount_percent:discountPercent,updated_at:new Date().toISOString()}).eq('id',id).is('deleted_at',null);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function markCustomerFamilyDiscountForDeletion(id:number):Promise<void>{
  const c = client();
  const { data:user } = await c.auth.getUser();
  const { error } = await c.from('customer_family_discount').update({active:false,deleted_at:new Date().toISOString(),deleted_by:user.user?.id ?? null}).eq('id',id).is('deleted_at',null);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function restoreCustomerFamilyDiscount(id:number):Promise<void>{
  const c = client();
  const { error } = await c.from('customer_family_discount').update({active:true,deleted_at:null,deleted_by:null,updated_at:new Date().toISOString()}).eq('id',id).not('deleted_at','is',null);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function listCustomerProductDiscounts(customerPartyId:number, includeDeleted=false):Promise<DiscountProductRow[]> {
  const c = client();
  let q = c.from('product_customer_discount')
    .select('id,customer_party_id,product_id,discount_percent,active,deleted_at,product!inner(code,commercial_description,technical_description,product_family(name))')
    .eq('customer_party_id',customerPartyId)
    .order('id');
  if (!includeDeleted) q = q.is('deleted_at', null);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return ((data ?? []) as Array<{
    id:number; customer_party_id:number; product_id:number; discount_percent:number; active:boolean; deleted_at:string|null;
    product:{code:string;commercial_description:string|null;technical_description:string|null;product_family:{name:string}|null};
  }>).map(r => ({
    id:r.id,
    customer_party_id:r.customer_party_id,
    product_id:r.product_id,
    product_code:r.product.code,
    product_name:r.product.commercial_description || r.product.technical_description || '',
    family_name:r.product.product_family?.name ?? null,
    discount_percent:Number(r.discount_percent),
    active:r.active,
    deleted_at:r.deleted_at,
  }));
}

export async function searchProductsForDiscount(companyId:number, search=''):Promise<EntityRef[]> {
  const c = client();
  const term = search.trim().replace(/[%_]/g, '');
  let q = c.from('product').select('id,code,commercial_description,technical_description').eq('company_id',companyId).eq('active',true).is('deleted_at',null).order('code').limit(12);
  if (term) q = q.or(`code.ilike.%${term}%,commercial_description.ilike.%${term}%,technical_description.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return ((data ?? []) as Array<{id:number;code:string;commercial_description:string|null;technical_description:string|null}>).map(x=>({id:x.id,code:x.code,name:x.commercial_description||x.technical_description||''}));
}

export async function createCustomerProductDiscount(customerPartyId:number, productId:number, discountPercent:number):Promise<void>{
  const c = client();
  const { error } = await c.from('product_customer_discount').insert({customer_party_id:customerPartyId,product_id:productId,discount_percent:discountPercent,active:true,deleted_at:null,deleted_by:null});
  if (error) throw new CoreRepositoryError(error.message);
}

export async function updateCustomerProductDiscount(id:number, discountPercent:number):Promise<void>{
  const c = client();
  const { error } = await c.from('product_customer_discount').update({discount_percent:discountPercent}).eq('id',id).is('deleted_at',null);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function markCustomerProductDiscountForDeletion(id:number):Promise<void>{
  const c = client();
  const { data:user } = await c.auth.getUser();
  const { error } = await c.from('product_customer_discount').update({active:false,deleted_at:new Date().toISOString(),deleted_by:user.user?.id ?? null}).eq('id',id).is('deleted_at',null);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function restoreCustomerProductDiscount(id:number):Promise<void>{
  const c = client();
  const { error } = await c.from('product_customer_discount').update({active:true,deleted_at:null,deleted_by:null}).eq('id',id).not('deleted_at','is',null);
  if (error) throw new CoreRepositoryError(error.message);
}
