import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type DimensionalStockRequest = {
  companyId:number;
  warehouseId:number;
  productId:number;
  quantity:number;
  characteristicId?:number|null;
  dimensionValues:number[];
  reference?:string|null;
  notes?:string|null;
};

export type DimensionalReservation = {
  id:number;
  status:'ACTIVE'|'RELEASED'|'CONSUMED';
  productId:number;
  characteristicId:number|null;
  quantity:number;
  dimensionValues:number[];
};

function client(){if(!supabase)throw new CoreRepositoryError('Supabase no está configurado.');return supabase;}

function validate(input:DimensionalStockRequest){
  if(!Number.isInteger(input.companyId)||input.companyId<=0)throw new CoreRepositoryError('Empresa no válida.');
  if(!Number.isInteger(input.warehouseId)||input.warehouseId<=0)throw new CoreRepositoryError('Almacén no válido.');
  if(!Number.isInteger(input.productId)||input.productId<=0)throw new CoreRepositoryError('Artículo no válido.');
  if(!Number.isInteger(input.quantity)||input.quantity<=0)throw new CoreRepositoryError('La cantidad debe ser un número entero de piezas.');
  if(!Array.isArray(input.dimensionValues)||input.dimensionValues.some(v=>!Number.isFinite(v)||v<=0))throw new CoreRepositoryError('Las dimensiones deben ser valores positivos.');
}

export async function reserveDimensionalStock(input:DimensionalStockRequest):Promise<number>{
  validate(input);
  const c=client();
  const {data,error}=await c.rpc('reserve_dimensional_stock',{
    p_company_id:input.companyId,
    p_warehouse_id:input.warehouseId,
    p_product_id:input.productId,
    p_quantity:input.quantity,
    p_characteristic_id:input.characteristicId??null,
    p_dimension_values:input.dimensionValues,
    p_reference:input.reference??null,
    p_notes:input.notes??null,
  });
  if(error)throw new CoreRepositoryError(error.message);
  return Number(data);
}

export async function releaseDimensionalStockReservation(reservationId:number):Promise<void>{
  if(!Number.isInteger(reservationId)||reservationId<=0)throw new CoreRepositoryError('Reserva no válida.');
  const {error}=await client().rpc('release_dimensional_stock_reservation',{p_reservation_id:reservationId});
  if(error)throw new CoreRepositoryError(error.message);
}

export async function consumeDimensionalStockReservation(reservationId:number):Promise<void>{
  if(!Number.isInteger(reservationId)||reservationId<=0)throw new CoreRepositoryError('Reserva no válida.');
  const {error}=await client().rpc('consume_dimensional_stock_reservation',{p_reservation_id:reservationId});
  if(error)throw new CoreRepositoryError(error.message);
}

export async function getDimensionalReservation(reservationId:number):Promise<DimensionalReservation|null>{
  const c=client();
  const {data,error}=await c.from('stock_reservation').select('id,status,product_id,characteristic_id,quantity,dimension_values').eq('id',reservationId).maybeSingle();
  if(error)throw new CoreRepositoryError(error.message);
  if(!data)return null;
  return {id:Number(data.id),status:data.status,productId:Number(data.product_id),characteristicId:data.characteristic_id==null?null:Number(data.characteristic_id),quantity:Number(data.quantity),dimensionValues:Array.isArray(data.dimension_values)?data.dimension_values.map(Number):[]};
}

export async function listReservationAllocations(reservationId:number){
  const {data,error}=await client().from('stock_reservation_item').select('id,reservation_id,stock_item_id,allocated_quantity,requested_dimension_values,remaining_dimension_values,status,consumed_at,warehouse_stock_item(id,dimension_values,status,parent_stock_item_id)').eq('reservation_id',reservationId).order('id');
  if(error)throw new CoreRepositoryError(error.message);
  return data??[];
}
