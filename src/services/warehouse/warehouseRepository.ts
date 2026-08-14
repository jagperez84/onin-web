import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type WarehouseStatus = 'active' | 'inactive' | 'deleted' | 'all';
export type Warehouse = {
  id:number; company_id:number; code:string; name:string; description:string|null; active:boolean; deleted_at:string|null; deleted_by:string|null;
};
export type WarehouseForm = Omit<Warehouse,'id'|'company_id'|'deleted_at'|'deleted_by'>;

function client(){ if(!supabase) throw new CoreRepositoryError('Supabase no está configurado.'); return supabase; }

export async function listWarehouses(companyId:number, search='', status:WarehouseStatus='active'):Promise<Warehouse[]> {
  const c=client(); let q=c.from('warehouse').select('id,company_id,code,name,description,active,deleted_at,deleted_by').eq('company_id',companyId).order('code');
  if(status==='active') q=q.eq('active',true).is('deleted_at',null);
  if(status==='inactive') q=q.eq('active',false).is('deleted_at',null);
  if(status==='deleted') q=q.not('deleted_at','is',null);
  const term=search.trim().replace(/[%_]/g,'');
  if(term) q=q.or(`code.ilike.%${term}%,name.ilike.%${term}%,description.ilike.%${term}%`);
  const {data,error}=await q; if(error) throw new CoreRepositoryError(error.message); return (data??[]) as Warehouse[];
}

export async function getWarehouse(companyId:number,id:number):Promise<Warehouse>{
  const c=client(); const {data,error}=await c.from('warehouse').select('id,company_id,code,name,description,active,deleted_at,deleted_by').eq('company_id',companyId).eq('id',id).single(); if(error) throw new CoreRepositoryError(error.message); return data as Warehouse;
}

export async function createWarehouse(companyId:number,input:WarehouseForm):Promise<number>{
  const c=client(); const {data,error}=await c.from('warehouse').insert({company_id:companyId,...input,deleted_at:null,deleted_by:null}).select('id').single(); if(error) throw new CoreRepositoryError(error.message); return Number(data.id);
}

export async function updateWarehouse(companyId:number,id:number,input:Partial<WarehouseForm>):Promise<void>{
  const c=client(); const {error}=await c.from('warehouse').update(input).eq('company_id',companyId).eq('id',id).is('deleted_at',null); if(error) throw new CoreRepositoryError(error.message);
}

export async function markWarehouseForDeletion(companyId:number,id:number):Promise<void>{
  const c=client(); const {data:user}=await c.auth.getUser(); const {error}=await c.from('warehouse').update({active:false,deleted_at:new Date().toISOString(),deleted_by:user.user?.id??null}).eq('company_id',companyId).eq('id',id).is('deleted_at',null); if(error) throw new CoreRepositoryError(error.message);
}

export async function restoreWarehouse(companyId:number,id:number):Promise<void>{
  const c=client(); const {error}=await c.from('warehouse').update({active:true,deleted_at:null,deleted_by:null}).eq('company_id',companyId).eq('id',id).not('deleted_at','is',null); if(error) throw new CoreRepositoryError(error.message);
}
