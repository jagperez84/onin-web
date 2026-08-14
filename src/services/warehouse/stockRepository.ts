import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type StockBalance = {
  id:number; warehouse_id:number; product_id:number; characteristic_id:number|null;
  quantity:number; reserved_quantity:number; updated_at:string;
  warehouse?:{code:string;name:string}|null;
  product?:{code:string;commercial_description:string|null;stock_minimum:number;base_unit_id:number|null}|null;
  characteristic?:{code:string;description:string|null}|null;
};

export type StockMovement = {
  id:number; company_id:number; warehouse_id:number; product_id:number; movement_type_id:number;
  characteristic_id:number|null; quantity:number; movement_date:string; reference:string|null; notes:string|null;
  transfer_group_id:string|null;
  movement_type?:{code:string;name:string;direction:number}|null;
  warehouse?:{code:string;name:string}|null;
  product?:{code:string;commercial_description:string|null}|null;
  characteristic?:{code:string;description:string|null}|null;
};

export type StockReservation = {
  id:number; company_id:number; warehouse_id:number; product_id:number; characteristic_id:number|null;
  quantity:number; reference:string|null; notes:string|null; status:'ACTIVE'|'RELEASED'|'CONSUMED';
  created_at:string; updated_at:string;
  warehouse?:{code:string;name:string}|null;
  product?:{code:string;commercial_description:string|null}|null;
  characteristic?:{code:string;description:string|null}|null;
};

export type StockProduct = {
  id:number; code:string; commercial_description:string|null; technical_description:string|null;
  stock_enabled:boolean; allow_negative_stock:boolean; include_stock_by_color:boolean; stock_minimum:number;
};

export type StockCharacteristic = { id:number; product_id:number; code:string; description:string|null; active:boolean; deleted_at:string|null };

function client(){ if(!supabase) throw new CoreRepositoryError('Supabase no está configurado.'); return supabase; }
function cleanTerm(value:string){ return value.trim().replace(/[%_]/g,''); }

export async function searchStockProducts(companyId:number, search=''):Promise<StockProduct[]> {
  const c=client(); let q=c.from('product').select('id,code,commercial_description,technical_description,stock_enabled,allow_negative_stock,include_stock_by_color,stock_minimum').eq('company_id',companyId).is('deleted_at',null).eq('active',true).eq('stock_enabled',true).order('code').limit(30);
  const term=cleanTerm(search); if(term) q=q.or(`code.ilike.%${term}%,commercial_description.ilike.%${term}%,technical_description.ilike.%${term}%`);
  const {data,error}=await q; if(error) throw new CoreRepositoryError(error.message); return (data??[]) as StockProduct[];
}

export async function listStockCharacteristics(productId:number):Promise<StockCharacteristic[]> {
  const c=client(); const {data,error}=await c.from('product_characteristic').select('id,product_id,code,description,active,deleted_at').eq('product_id',productId).eq('active',true).is('deleted_at',null).order('code');
  if(error) throw new CoreRepositoryError(error.message); return (data??[]) as StockCharacteristic[];
}

export async function listStockBalances(companyId:number, warehouseId?:number, search=''):Promise<StockBalance[]> {
  const c=client();
  const {data:warehouseRows,error:warehouseError}=await c.from('warehouse').select('id').eq('company_id',companyId).is('deleted_at',null);
  if(warehouseError) throw new CoreRepositoryError(warehouseError.message);
  const warehouseIds=(warehouseRows??[]).map((w:{id:number})=>w.id).filter(Boolean);
  if(warehouseIds.length===0)return [];
  let q=c.from('warehouse_stock').select('id,warehouse_id,product_id,characteristic_id,quantity,reserved_quantity,updated_at,warehouse:warehouse(code,name),product:product(code,commercial_description,stock_minimum,base_unit_id),characteristic:product_characteristic(code,description)').in('warehouse_id',warehouseId?[warehouseId]:warehouseIds).order('updated_at',{ascending:false});
  const {data,error}=await q; if(error) throw new CoreRepositoryError(error.message);
  const rows=(data??[]) as unknown as StockBalance[];
  const term=cleanTerm(search).toLowerCase();
  return term ? rows.filter(r=>`${r.product?.code??''} ${r.product?.commercial_description??''} ${r.characteristic?.code??''} ${r.characteristic?.description??''}`.toLowerCase().includes(term)) : rows;
}

export async function listStockMovements(companyId:number, filters:{warehouseId?:number;productId?:number;from?:string;to?:string}={}):Promise<StockMovement[]> {
  const c=client(); let q=c.from('stock_movement').select('id,company_id,warehouse_id,product_id,movement_type_id,characteristic_id,quantity,movement_date,reference,notes,transfer_group_id,movement_type:stock_movement_type(code,name,direction),warehouse:warehouse(code,name),product:product(code,commercial_description),characteristic:product_characteristic(code,description)').eq('company_id',companyId).order('movement_date',{ascending:false}).order('id',{ascending:false});
  if(filters.warehouseId) q=q.eq('warehouse_id',filters.warehouseId);
  if(filters.productId) q=q.eq('product_id',filters.productId);
  if(filters.from) q=q.gte('movement_date',`${filters.from}T00:00:00`);
  if(filters.to) q=q.lte('movement_date',`${filters.to}T23:59:59.999`);
  const {data,error}=await q.limit(500); if(error) throw new CoreRepositoryError(error.message); return (data??[]) as unknown as StockMovement[];
}

export async function listMovementTypes(companyId:number){
  const c=client(); const {data,error}=await c.from('stock_movement_type').select('id,code,name,direction').eq('company_id',companyId).eq('active',true).order('direction',{ascending:false}).order('code');
  if(error) throw new CoreRepositoryError(error.message); return (data??[]) as {id:number;code:string;name:string;direction:number}[];
}

export async function registerStockMovement(input:{companyId:number;warehouseId:number;productId:number;quantity:number;movementTypeCode:string;characteristicId?:number|null;reference?:string;notes?:string;movementDate?:string}):Promise<number>{
  const c=client(); const {data,error}=await c.rpc('register_stock_movement',{p_company_id:input.companyId,p_warehouse_id:input.warehouseId,p_product_id:input.productId,p_quantity:input.quantity,p_movement_type_code:input.movementTypeCode,p_characteristic_id:input.characteristicId??null,p_reference:input.reference??null,p_notes:input.notes??null,p_movement_date:input.movementDate?new Date(input.movementDate).toISOString():new Date().toISOString(),p_transfer_group_id:null});
  if(error) throw new CoreRepositoryError(error.message); return Number(data);
}

export async function registerStockTransfer(input:{companyId:number;sourceWarehouseId:number;targetWarehouseId:number;productId:number;quantity:number;characteristicId?:number|null;reference?:string;notes?:string;movementDate?:string}):Promise<string>{
  const c=client(); const {data,error}=await c.rpc('register_stock_transfer',{p_company_id:input.companyId,p_source_warehouse_id:input.sourceWarehouseId,p_target_warehouse_id:input.targetWarehouseId,p_product_id:input.productId,p_quantity:input.quantity,p_characteristic_id:input.characteristicId??null,p_reference:input.reference??null,p_notes:input.notes??null,p_movement_date:input.movementDate?new Date(input.movementDate).toISOString():new Date().toISOString()});
  if(error) throw new CoreRepositoryError(error.message); return String(data);
}

export async function listStockReservations(companyId:number, status='ACTIVE'):Promise<StockReservation[]> {
  const c=client(); const {data,error}=await c.from('stock_reservation').select('id,company_id,warehouse_id,product_id,characteristic_id,quantity,reference,notes,status,created_at,updated_at,warehouse:warehouse(code,name),product:product(code,commercial_description),characteristic:product_characteristic(code,description)').eq('company_id',companyId).eq('status',status).order('created_at',{ascending:false});
  if(error) throw new CoreRepositoryError(error.message); return (data??[]) as unknown as StockReservation[];
}

export async function reserveStock(input:{companyId:number;warehouseId:number;productId:number;quantity:number;characteristicId?:number|null;reference?:string;notes?:string}):Promise<number>{
  const c=client(); const {data,error}=await c.rpc('reserve_stock',{p_company_id:input.companyId,p_warehouse_id:input.warehouseId,p_product_id:input.productId,p_quantity:input.quantity,p_characteristic_id:input.characteristicId??null,p_reference:input.reference??null,p_notes:input.notes??null});
  if(error) throw new CoreRepositoryError(error.message); return Number(data);
}

export async function releaseStockReservation(id:number):Promise<void>{ const c=client(); const {error}=await c.rpc('release_stock_reservation',{p_reservation_id:id}); if(error) throw new CoreRepositoryError(error.message); }
export async function consumeStockReservation(id:number):Promise<void>{ const c=client(); const {error}=await c.rpc('consume_stock_reservation',{p_reservation_id:id}); if(error) throw new CoreRepositoryError(error.message); }
