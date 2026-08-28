import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { syncWarehouseStockItems } from '../warehouse/stockRepository';

export type WorkSheetStatus = 'ISSUED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type WorkSheetLine = { id:number; line_no:number; warehouse_id:number; warehouse_code:string|null; warehouse_name:string|null; stock_item_id:number|null; source_dimension_values:number[]; cut_dimension_values:number[]; quantity:number; remainder_dimension_values:number[]; selection_reason:string|null; };
export type WorkSheet = { id:number; company_id:number; code:string; document_type:'PROFILE_CUT'; issue_date:string; status:WorkSheetStatus; sales_order_id:number|null; sales_order_line_id:number|null; sales_order_line_no:number|null; sales_order_code?:string|null; product_id:number|null; product_code:string|null; product_name:string|null; characteristic_id:number|null; characteristic_code:string|null; characteristic_name:string|null; required_length:number; quantity:number; unit_symbol?:string|null; unit_code?:string|null; reference:string|null; notes:string|null; selection_mode:string|null; selection_reason:string|null; lines:WorkSheetLine[]; };
function client(){if(!supabase)throw new CoreRepositoryError('Supabase no está configurado.');return supabase}
const numbers=(value:unknown):number[]=>Array.isArray(value)?value.map(Number).filter(Number.isFinite):[];
function mapLine(row:any):WorkSheetLine{return{id:Number(row.id),line_no:Number(row.line_no),warehouse_id:Number(row.warehouse_id),warehouse_code:row.warehouse_code??null,warehouse_name:row.warehouse_name??null,stock_item_id:row.stock_item_id==null?null:Number(row.stock_item_id),source_dimension_values:numbers(row.source_dimension_values),cut_dimension_values:numbers(row.cut_dimension_values),quantity:Number(row.quantity||0),remainder_dimension_values:numbers(row.remainder_dimension_values),selection_reason:row.selection_reason??null}}

function extractUnitFromRow(row:any):string|null{
  if(row.unit_symbol) return String(row.unit_symbol);
  if(row.unit_code) return String(row.unit_code);
  const lineSnapshot=(row.sales_order_line?.specific_data?.configuration_snapshot||row.sales_order_line?.specific_data?.otd_snapshot||row.sales_order_line?.specific_data||{}) as any;
  const components=Array.isArray(lineSnapshot.components)?lineSnapshot.components:[];
  const comp=components.find((c:any)=>/perfil|profile/i.test(`${c.product_code||''} ${c.product_name||''}`))||components[0]||null;
  const unit =
    comp?.dimension_list?.[0]?.unit_symbol ||
    comp?.dimension_list?.[0]?.unit_code ||
    comp?.dimensions?.[0]?.unit_symbol ||
    comp?.dimensions?.[0]?.unit_code ||
    lineSnapshot.dimensions?.[0]?.unit_symbol ||
    lineSnapshot.dimensions?.[0]?.unit_code ||
    lineSnapshot.work_unit?.symbol ||
    lineSnapshot.work_unit_symbol ||
    lineSnapshot.work_unit?.code ||
    lineSnapshot.work_unit_code ||
    null;
  if(unit) return String(unit);
  if(typeof row.notes==='string'){
    const match=row.notes.match(/de\s+[\d.,]+\s+([a-zA-Z%]+)\./i);
    if(match&&match[1]) return match[1];
  }
  return null;
}

function mapWorkSheet(row:any):WorkSheet{return{id:Number(row.id),company_id:Number(row.company_id),code:row.code,document_type:row.document_type,issue_date:row.issue_date,status:row.status,sales_order_id:row.sales_order_id==null?null:Number(row.sales_order_id),sales_order_line_id:row.sales_order_line_id==null?null:Number(row.sales_order_line_id),sales_order_line_no:row.sales_order_line_no==null?null:Number(row.sales_order_line_no),sales_order_code:row.sales_order?.code??null,product_id:row.product_id==null?null:Number(row.product_id),product_code:row.product_code??null,product_name:row.product_name??null,characteristic_id:row.characteristic_id==null?null:Number(row.characteristic_id),characteristic_code:row.characteristic_code??null,characteristic_name:row.characteristic_name??null,required_length:Number(row.required_length||0),quantity:Number(row.quantity||0),unit_symbol:extractUnitFromRow(row),unit_code:extractUnitFromRow(row),reference:row.reference??null,notes:row.notes??null,selection_mode:row.selection_mode??null,selection_reason:row.selection_reason??null,lines:(row.lines||[]).sort((a:any,b:any)=>Number(a.line_no)-Number(b.line_no)).map(mapLine)}}

export async function executeManualProfileCutWithWorkSheet(input:{companyId:number;salesOrderId:number;salesOrderLineId:number;salesOrderLineNo:number;productId:number;productCode:string;productName:string;characteristicId:number|null;characteristicCode:string|null;characteristicName:string|null;requiredLength:number;quantity:number;selections:Array<{warehouseId:number;dimensionValues:number[];quantity:number}>;reference?:string|null;notes?:string|null;selectionMode?:'MANUAL'|'AUTOMATIC';selectionReason?:string|null;unitSymbol?:string|null;}):Promise<WorkSheet>{if(!input.salesOrderId||!input.salesOrderLineId)throw new CoreRepositoryError('El corte debe estar vinculado a una línea de pedido.');if(!input.productId||input.requiredLength<=0||input.quantity<=0)throw new CoreRepositoryError('Datos de corte incompletos.');const selectedQuantity=input.selections.reduce((sum,s)=>sum+Number(s.quantity||0),0);if(selectedQuantity!==input.quantity)throw new CoreRepositoryError(`La selección contiene ${selectedQuantity} piezas y la línea requiere ${input.quantity}.`);
await syncWarehouseStockItems(input.companyId, input.productId).catch(() => {});
const{data,error}=await client().rpc('execute_manual_dimensional_cut_with_work_sheet',{p_company_id:input.companyId,p_sales_order_id:input.salesOrderId,p_sales_order_line_id:input.salesOrderLineId,p_sales_order_line_no:input.salesOrderLineNo,p_product_id:input.productId,p_product_code:input.productCode,p_product_name:input.productName,p_characteristic_id:input.characteristicId,p_characteristic_code:input.characteristicCode,p_characteristic_name:input.characteristicName,p_required_dimension_values:[input.requiredLength],p_quantity:input.quantity,p_selections:input.selections.map(s=>({warehouse_id:s.warehouseId,dimension_values:s.dimensionValues,quantity:s.quantity})),p_reference:input.reference??null,p_notes:input.notes??null});if(error)throw new CoreRepositoryError(error.message);const workSheet=await getWorkSheet(Number(data));if(!workSheet)throw new CoreRepositoryError('La hoja de corte se ha generado pero no se ha podido recuperar.');
const headerUpdate:Record<string,unknown>={};if(input.selectionMode)headerUpdate.selection_mode=input.selectionMode;if(input.selectionReason)headerUpdate.selection_reason=input.selectionReason;if(input.unitSymbol){headerUpdate.unit_symbol=input.unitSymbol;headerUpdate.unit_code=input.unitSymbol;}
if(Object.keys(headerUpdate).length){const c=client();const{error:updateError}=await c.from('production_work_sheet').update(headerUpdate).eq('id',workSheet.id);if(updateError)throw new CoreRepositoryError(updateError.message);if(input.selectionReason){const{error:lineError}=await c.from('production_work_sheet_line').update({selection_reason:input.selectionReason}).eq('work_sheet_id',workSheet.id);if(lineError)throw new CoreRepositoryError(lineError.message)}const refreshed=await getWorkSheet(workSheet.id);return refreshed??workSheet}
return workSheet}

export async function listWorkSheets(search='',status:WorkSheetStatus|'ALL'='ALL'):Promise<WorkSheet[]>{const c=client();let query=c.from('production_work_sheet').select('*,sales_order:sales_order_id(code),sales_order_line:sales_order_line_id(specific_data)').eq('document_type','PROFILE_CUT').order('issue_date',{ascending:false}).order('id',{ascending:false});if(status!=='ALL')query=query.eq('status',status);const term=search.trim().replace(/[%_]/g,'');if(term)query=query.or(`code.ilike.%${term}%,product_code.ilike.%${term}%,product_name.ilike.%${term}%,reference.ilike.%${term}%`);const{data,error}=await query;if(error)throw new CoreRepositoryError(error.message);return(data||[]).map(row=>mapWorkSheet({...row,lines:[]}))}
export async function getWorkSheet(id:number):Promise<WorkSheet|null>{const c=client();const{data,error}=await c.from('production_work_sheet').select('*,sales_order:sales_order_id(code),sales_order_line:sales_order_line_id(specific_data),lines:production_work_sheet_line(*)').eq('id',id).eq('document_type','PROFILE_CUT').maybeSingle();if(error)throw new CoreRepositoryError(error.message);return data?mapWorkSheet(data):null}
export async function getWorkSheetBySalesOrderLine(salesOrderLineId:number):Promise<WorkSheet|null>{const c=client();const{data,error}=await c.from('production_work_sheet').select('*,sales_order:sales_order_id(code),sales_order_line:sales_order_line_id(specific_data),lines:production_work_sheet_line(*)').eq('sales_order_line_id',salesOrderLineId).eq('document_type','PROFILE_CUT').order('issue_date',{ascending:false}).order('id',{ascending:false}).limit(1).maybeSingle();if(error)throw new CoreRepositoryError(error.message);return data?mapWorkSheet(data):null}
export async function getWorkSheetsBySalesOrderLine(salesOrderLineId:number):Promise<WorkSheet[]>{const c=client();const{data,error}=await c.from('production_work_sheet').select('*,sales_order:sales_order_id(code),sales_order_line:sales_order_line_id(specific_data),lines:production_work_sheet_line(*)').eq('sales_order_line_id',salesOrderLineId).eq('document_type','PROFILE_CUT').order('issue_date',{ascending:false}).order('id',{ascending:false});if(error)throw new CoreRepositoryError(error.message);return (data||[]).map(mapWorkSheet)}
