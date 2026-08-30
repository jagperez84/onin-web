import { supabase } from '../../lib/supabase';
import { loadMasterProductConfiguration } from '../catalog/productConfigurationService';
import type { MasterProductConfiguration } from '../catalog/productConfigurationService';
import { CoreRepositoryError } from '../core/coreRepository';

export type LonaConfectionComponent = { index:number; productId:number; productCode:string; productName:string; characteristicId:number|null; characteristicCode:string|null; characteristicName:string|null; quantity:number; line:number|null; output:number|null; lineUnit:string|null; outputUnit:string|null; lineDimensionCode:string|null; outputDimensionCode:string|null; sourceComponent:OtdComponentSnapshot; productConfiguration:MasterProductConfiguration; };
export type LonaCutGeometry = { width:number; height:number; widthLabel:string; heightLabel:string };
export type LonaStockCandidate = { stockItemId:number; warehouseId:number; warehouseCode:string; warehouseName:string; productId:number; characteristicId:number|null; characteristicCode:string|null; quantity:number; sourceDimensions:number[]; sourceDimensionUnits:string[]; cutDimensions:[number,number]; cutDimensionUnits:string[]; remainderDimensions:[number,number]|null; remainderDimensionUnits:string[]; rotated:boolean; score:number; reason:string; };
export type LonaConfectionResult = { orderLineId:number; orderLineNo:number; reference:string|null; otdCode:string|null; components:LonaConfectionComponent[]; };
export type LonaConfectionWorkSheet = { id:number; code:string; issueDate:string; status:string; orderLineId:number; productCode:string|null; productName:string|null; characteristicName:string|null; quantity:number; requiredDimensions:number[]; requiredDimensionUnits:string[]; unitSymbol:string|null; selectionMode:string|null; selectionReason:string|null; lines:Array<{id:number;lineNo:number;warehouseCode:string|null;warehouseName:string|null;stockItemId:number|null;sourceDimensions:number[];sourceDimensionUnits:string[];cutDimensions:number[];cutDimensionUnits:string[];quantity:number;remainderDimensions:number[];remainderDimensionUnits:string[]}>; };

type OtdDimensionSnapshot={code?:string|null;name?:string|null;value?:unknown;unit_id?:number|null;unit_symbol?:string|null;unit_code?:string|null};
type OtdComponentSnapshot={product_id?:unknown;product_code?:unknown;product_name?:unknown;characteristic_id?:unknown;characteristic_name?:unknown;characteristic_code?:unknown;characteristic?:{id?:unknown;code?:unknown;description?:unknown};quantity?:unknown;dimension_list?:OtdDimensionSnapshot[];dimensions?:Record<string,unknown>};
type OtdSnapshot={otd_code?:unknown;characteristic_id?:unknown;characteristic_code?:unknown;characteristic_name?:unknown;characteristic?:{id?:unknown;code?:unknown;description?:unknown};components?:OtdComponentSnapshot[];dimensions?:OtdDimensionSnapshot[]};
type DimensionValue=OtdDimensionSnapshot;
type StockHeaderRow={id:number;warehouse_id:number};
type CharacteristicRow={id:number;code:string|null;description:string|null};
type WarehouseRow={id:number;code:string|null;name:string|null};
type StockItemRow={id:number;product_id:number;warehouse_stock_id:number;characteristic_id:number|null;quantity:number;dimension_values:unknown;dimension_units:unknown;status:string};

function client(){if(!supabase)throw new CoreRepositoryError('Supabase no está configurado.');return supabase}
function numeric(value:unknown):number|null{const n=Number(value);return Number.isFinite(n)?n:null}
function unitText(dimension:DimensionValue|undefined,configuration:MasterProductConfiguration):string|null{if(!dimension)return null;if(dimension.unit_symbol)return String(dimension.unit_symbol);if(dimension.unit_code)return String(dimension.unit_code);if(dimension.unit_id!=null){const unit=configuration.unitsMap.get(Number(dimension.unit_id));if(unit)return unit.code||unit.name}const definition=configuration.dimensions.find(candidate=>(dimension.code&&candidate.code===dimension.code)||(dimension.name&&candidate.name===dimension.name));if(definition?.unit_id!=null){const unit=configuration.unitsMap.get(Number(definition.unit_id));if(unit)return unit.code||unit.name}return null}
function dimensionText(dimension:DimensionValue|undefined):string{return`${dimension?.code??''} ${dimension?.name??''}`.trim().toLowerCase()}
function componentDimensions(component:OtdComponentSnapshot,snapshot:OtdSnapshot):DimensionValue[]{if(Array.isArray(component.dimension_list)&&component.dimension_list.length)return component.dimension_list;if(component.dimensions&&typeof component.dimensions==='object'){const entries=Object.entries(component.dimensions).map(([code,value])=>({code,value} as OtdDimensionSnapshot));if(entries.length)return entries}return Array.isArray(snapshot.dimensions)?snapshot.dimensions:[]}
function resolveCutDimensions(dimensions:DimensionValue[]):{line:DimensionValue|undefined;output:DimensionValue|undefined}{if(dimensions.length<2)return{line:dimensions[0],output:undefined};const lineIndex=dimensions.findIndex(d=>(/(^|\b)(linea|línea|ancho|width)(\b|$)/i).test(dimensionText(d)));const outputIndex=dimensions.findIndex(d=>(/(^|\b)(salida|alto|altura|height)(\b|$)/i).test(dimensionText(d)));if(lineIndex>=0&&outputIndex>=0&&lineIndex!==outputIndex)return{line:dimensions[lineIndex],output:dimensions[outputIndex]};return{line:dimensions[0],output:dimensions[1]}}
function getGeometry(component:LonaConfectionComponent):LonaCutGeometry|null{const dimensions=component.sourceComponent.dimension_list?.length?component.sourceComponent.dimension_list:Object.entries(component.sourceComponent.dimensions??{}).map(([code,value])=>({code,value} as OtdDimensionSnapshot));const{line,output}=resolveCutDimensions(dimensions);const width=numeric(line?.value);const height=numeric(output?.value);if(width==null||height==null||width<=0||height<=0)return null;return{width,height,widthLabel:`${line?.code??line?.name??'Línea'}${component.lineUnit?` (${component.lineUnit})`:''}`,heightLabel:`${output?.code??output?.name??'Salida'}${component.outputUnit?` (${component.outputUnit})`:''}`}}
export function getLonaCutGeometry(component:LonaConfectionComponent):LonaCutGeometry|null{return getGeometry(component)}

const LENGTH_FACTORS_MM:Record<string,number>={mm:1,millimeter:1,millimetre:1,cm:10,centimeter:10,centimetre:10,m:1000,meter:1000,metre:1000};
function normalizeLength(value:number,unit:string|null):number|null{if(!unit)return null;const factor=LENGTH_FACTORS_MM[unit.trim().toLowerCase()];return factor==null?null:value*factor}
function asStringArray(value:unknown):string[]{return Array.isArray(value)?value.map(v=>String(v??'')):[]}

export type LonaPieceRequirement={width:number;length:number;label:string};
export type LonaPieceAllocation={width:number;length:number;label:string;candidate:LonaStockCandidate|null};

/**
 * Asigna una existencia física distinta a cada pieza pedida (un paño, un retal, la pieza
 * única de un degradé…), sin repetir la misma pieza de stock entre dos piezas de corte. A
 * diferencia del modelo antiguo (una sola candidata para "línea × salida enteras, girando si
 * hace falta"), esto refleja que un corte con varios paños necesita varias piezas físicas de
 * material, potencialmente de rollos distintos.
 */
export async function allocateLonaStockForPieces(input:{companyId:number;productId:number;characteristicId?:number|null;characteristicCode?:string|null;pieces:LonaPieceRequirement[];unit?:string|null}):Promise<LonaPieceAllocation[]>{
 const c=client();
 if(!input.pieces.length)return[];
 const {data:itemData,error:itemError}=await c.from('warehouse_stock_item').select('id,product_id,warehouse_stock_id,characteristic_id,quantity,dimension_values,dimension_units,status').eq('product_id',input.productId).gt('quantity',0).eq('status','AVAILABLE').order('created_at',{ascending:true}).limit(500);
 if(itemError)throw new CoreRepositoryError(itemError.message);
 const items=(itemData??[]) as StockItemRow[];
 const stockIds=[...new Set(items.map(row=>Number(row.warehouse_stock_id)).filter(Number.isFinite))];
 const characteristicIds=[...new Set(items.map(row=>row.characteristic_id==null?null:Number(row.characteristic_id)).filter((id):id is number=>id!=null))];
 const [stocksResult,characteristicsResult]=await Promise.all([stockIds.length?c.from('warehouse_stock').select('id,warehouse_id').in('id',stockIds):Promise.resolve({data:[],error:null}),characteristicIds.length?c.from('product_characteristic').select('id,code,description').in('id',characteristicIds):Promise.resolve({data:[],error:null})]);
 if(stocksResult.error)throw new CoreRepositoryError(stocksResult.error.message);if(characteristicsResult.error)throw new CoreRepositoryError(characteristicsResult.error.message);
 const stocks=(stocksResult.data??[]) as StockHeaderRow[];const characteristics=(characteristicsResult.data??[]) as CharacteristicRow[];const warehouseIds=[...new Set(stocks.map(row=>Number(row.warehouse_id)).filter(Number.isFinite))];const warehousesResult=warehouseIds.length?await c.from('warehouse').select('id,code,name').in('id',warehouseIds):{data:[],error:null};if(warehousesResult.error)throw new CoreRepositoryError(warehousesResult.error.message);
 const stockById=new Map(stocks.map(row=>[Number(row.id),row]));const characteristicById=new Map(characteristics.map(row=>[Number(row.id),row]));const warehouseById=new Map(((warehousesResult.data??[]) as WarehouseRow[]).map(row=>[Number(row.id),row]));

 const reqCharId=input.characteristicId!=null&&Number(input.characteristicId)>0?Number(input.characteristicId):null;
 const reqCharCode=(typeof input.characteristicCode==='string'&&input.characteristicCode.trim().length>0)?input.characteristicCode.trim().toLowerCase():null;

 const matchesCharacteristic=(row:StockItemRow):{characteristicId:number|null;characteristicCode:string|null}|null=>{
   const characteristicId=row.characteristic_id==null?null:Number(row.characteristic_id);
   const charObj=characteristicId==null?null:characteristicById.get(characteristicId);
   const characteristicCode=charObj?.code??null;
   const charCodeLower=charObj?.code?charObj.code.trim().toLowerCase():null;
   const charDescLower=charObj?.description?charObj.description.trim().toLowerCase():null;
   if(reqCharId!==null||reqCharCode!==null){
     let match=false;
     if(reqCharId!==null&&characteristicId!==null&&characteristicId===reqCharId)match=true;
     if(reqCharCode!==null){if(charCodeLower&&charCodeLower===reqCharCode)match=true;if(charDescLower&&charDescLower===reqCharCode)match=true;}
     if(!match)return null;
   }else if(characteristicId!==null||characteristicCode!==null)return null;
   return{characteristicId,characteristicCode};
 };

 const excluded=new Set<number>();
 const allocations:LonaPieceAllocation[]=[];

 for(const piece of input.pieces){
   const requiredWidthMm=normalizeLength(piece.width,input.unit??null);const requiredLengthMm=normalizeLength(piece.length,input.unit??null);
   let best:LonaStockCandidate|null=null;
   if(requiredWidthMm!=null&&requiredLengthMm!=null){
     for(const row of items){
       if(excluded.has(Number(row.id)))continue;
       const characteristicMatch=matchesCharacteristic(row);if(!characteristicMatch)continue;
       const dimensions=Array.isArray(row.dimension_values)?row.dimension_values.map(Number).filter(Number.isFinite):[];const units=asStringArray(row.dimension_units);if(dimensions.length<2||units.length!==dimensions.length)continue;
       const d0=normalizeLength(dimensions[0],units[0]);const d1=normalizeLength(dimensions[1],units[1]);if(d0==null||d1==null)continue;
       const direct=d0>=requiredWidthMm&&d1>=requiredLengthMm;const rotated=d0>=requiredLengthMm&&d1>=requiredWidthMm;if(!direct&&!rotated)continue;const useRotated=!direct&&rotated;
       const cut:[number,number]=useRotated?[piece.length,piece.width]:[piece.width,piece.length];const cutDimensionUnits=[input.unit??'',input.unit??''];const cutMm:[number,number]=useRotated?[requiredLengthMm,requiredWidthMm]:[requiredWidthMm,requiredLengthMm];
       const remainderMm:[number,number]=[Math.max(0,d0-cutMm[0]),Math.max(0,d1-cutMm[1])];const factor0=LENGTH_FACTORS_MM[units[0].trim().toLowerCase()]??1;const factor1=LENGTH_FACTORS_MM[units[1].trim().toLowerCase()]??1;const remainder:[number,number]=[remainderMm[0]/factor0,remainderMm[1]/factor1];const waste=remainderMm[0]*remainderMm[1];
       const stock=stockById.get(Number(row.warehouse_stock_id));if(!stock)continue;const warehouse=warehouseById.get(Number(stock.warehouse_id));if(!warehouse)continue;
       const score=(useRotated?100000:0)+waste;
       if(best===null||score<best.score){
         best={stockItemId:Number(row.id),warehouseId:Number(stock.warehouse_id),warehouseCode:warehouse.code??'—',warehouseName:warehouse.name??'—',productId:Number(row.product_id),characteristicId:characteristicMatch.characteristicId,characteristicCode:characteristicMatch.characteristicCode,quantity:Number(row.quantity||0),sourceDimensions:dimensions,sourceDimensionUnits:units,cutDimensions:cut,cutDimensionUnits,remainderDimensions:remainder,remainderDimensionUnits:[units[0],units[1]],rotated:useRotated,score,reason:useRotated?'Material compatible girando la pieza.':'Material compatible en la orientación original.'};
       }
     }
   }
   if(best)excluded.add(best.stockItemId);
   allocations.push({width:piece.width,length:piece.length,label:piece.label,candidate:best});
 }
 return allocations;
}

export type LonaStockRollProbe = { stockItemId:number; warehouseId:number; warehouseCode:string; warehouseName:string; characteristicId:number|null; characteristicCode:string|null; quantity:number; sourceDimensions:number[]; sourceDimensionUnits:string[]; rotated:boolean; };

/**
 * A diferencia de allocateLonaStockForPieces (que exige una pieza de stock ya del tamaño del
 * corte completo), esto solo averigua qué ancho de bobina hay realmente disponible para el
 * producto/característica, sin exigir que cubra el pedido entero. Ese ancho real es justo lo
 * que calculateLonaCut necesita para decidir en cuántos paños dividir el corte — los tipos
 * "Asimétrico"/"Retal Maxi"/"Retal Mini"/"Screen" existen precisamente para toldos más anchos
 * que cualquier bobina individual, cosiendo varios paños. Se prioriza la bobina más ancha
 * disponible, para minimizar el número de paños/costuras.
 */
export async function probeLonaStockWidth(input:{companyId:number;productId:number;characteristicId?:number|null;characteristicCode?:string|null}):Promise<LonaStockRollProbe|null>{
  const c=client();
  const{data:itemData,error:itemError}=await c.from('warehouse_stock_item').select('id,product_id,warehouse_stock_id,characteristic_id,quantity,dimension_values,dimension_units,status').eq('product_id',input.productId).gt('quantity',0).eq('status','AVAILABLE').limit(500);
  if(itemError)throw new CoreRepositoryError(itemError.message);
  const items=(itemData??[]) as StockItemRow[];
  if(!items.length)return null;

  const stockIds=[...new Set(items.map(row=>Number(row.warehouse_stock_id)).filter(Number.isFinite))];
  const characteristicIds=[...new Set(items.map(row=>row.characteristic_id==null?null:Number(row.characteristic_id)).filter((id):id is number=>id!=null))];
  const [stocksResult,characteristicsResult]=await Promise.all([stockIds.length?c.from('warehouse_stock').select('id,warehouse_id').in('id',stockIds):Promise.resolve({data:[],error:null}),characteristicIds.length?c.from('product_characteristic').select('id,code,description').in('id',characteristicIds):Promise.resolve({data:[],error:null})]);
  if(stocksResult.error)throw new CoreRepositoryError(stocksResult.error.message);if(characteristicsResult.error)throw new CoreRepositoryError(characteristicsResult.error.message);
  const stocks=(stocksResult.data??[]) as StockHeaderRow[];const characteristics=(characteristicsResult.data??[]) as CharacteristicRow[];const warehouseIds=[...new Set(stocks.map(row=>Number(row.warehouse_id)).filter(Number.isFinite))];const warehousesResult=warehouseIds.length?await c.from('warehouse').select('id,code,name').in('id',warehouseIds):{data:[],error:null};if(warehousesResult.error)throw new CoreRepositoryError(warehousesResult.error.message);
  const stockById=new Map(stocks.map(row=>[Number(row.id),row]));const characteristicById=new Map(characteristics.map(row=>[Number(row.id),row]));const warehouseById=new Map(((warehousesResult.data??[]) as WarehouseRow[]).map(row=>[Number(row.id),row]));

  const reqCharId=input.characteristicId!=null&&Number(input.characteristicId)>0?Number(input.characteristicId):null;
  const reqCharCode=(typeof input.characteristicCode==='string'&&input.characteristicCode.trim().length>0)?input.characteristicCode.trim().toLowerCase():null;

  let best:LonaStockRollProbe|null=null;
  let bestWidth=-Infinity;
  for(const row of items){
    const characteristicId=row.characteristic_id==null?null:Number(row.characteristic_id);
    const charObj=characteristicId==null?null:characteristicById.get(characteristicId);
    const characteristicCode=charObj?.code??null;
    const charCodeLower=charObj?.code?charObj.code.trim().toLowerCase():null;
    const charDescLower=charObj?.description?charObj.description.trim().toLowerCase():null;
    if(reqCharId!==null||reqCharCode!==null){
      let match=false;
      if(reqCharId!==null&&characteristicId!==null&&characteristicId===reqCharId)match=true;
      if(reqCharCode!==null){if(charCodeLower&&charCodeLower===reqCharCode)match=true;if(charDescLower&&charDescLower===reqCharCode)match=true;}
      if(!match)continue;
    }else if(characteristicId!==null||characteristicCode!==null){
      continue;
    }

    const dimensions=Array.isArray(row.dimension_values)?row.dimension_values.map(Number).filter(Number.isFinite):[];
    const units=asStringArray(row.dimension_units);
    if(dimensions.length<2||units.length!==dimensions.length)continue;
    const width=dimensions[0];
    if(!Number.isFinite(width)||width<=0)continue;

    const stock=stockById.get(Number(row.warehouse_stock_id));if(!stock)continue;
    const warehouse=warehouseById.get(Number(stock.warehouse_id));if(!warehouse)continue;

    if(width>bestWidth){
      bestWidth=width;
      best={stockItemId:Number(row.id),warehouseId:Number(stock.warehouse_id),warehouseCode:warehouse.code??'—',warehouseName:warehouse.name??'—',characteristicId,characteristicCode,quantity:Number(row.quantity||0),sourceDimensions:dimensions,sourceDimensionUnits:units,rotated:false};
    }
  }
  return best;
}

export async function resolveLonaConfectionComponents(input:{companyId:number;orderLineId:number;orderLineNo:number;reference?:string|null;snapshot:OtdSnapshot}):Promise<LonaConfectionResult>{const snapshot=input.snapshot??{};const rawComponents=Array.isArray(snapshot.components)?snapshot.components:[];const candidates=rawComponents.map((component,index)=>({component,index})).filter(({component})=>Number(component.product_id)>0);const resolved=(await Promise.all(candidates.map(async({component,index})=>{const productId=Number(component.product_id);const configuration=await loadMasterProductConfiguration(productId,input.companyId);if(!configuration.family?.confectionable)return null;const dimensions=componentDimensions(component,snapshot);const{line,output}=resolveCutDimensions(dimensions);
const characteristicId =
  (component.characteristic_id ? Number(component.characteristic_id) : undefined) ||
  (component.characteristic?.id ? Number(component.characteristic?.id) : undefined) ||
  (snapshot.characteristic_id ? Number(snapshot.characteristic_id) : undefined) ||
  (snapshot.characteristic?.id ? Number(snapshot.characteristic?.id) : undefined) ||
  null;
const characteristicCode =
  (component.characteristic_code ? String(component.characteristic_code) : undefined) ||
  (component.characteristic?.code ? String(component.characteristic?.code) : undefined) ||
  (snapshot.characteristic_code ? String(snapshot.characteristic_code) : undefined) ||
  (snapshot.characteristic?.code ? String(snapshot.characteristic?.code) : undefined) ||
  null;
const characteristicName =
  (component.characteristic_name ? String(component.characteristic_name) : undefined) ||
  (component.characteristic?.description ? String(component.characteristic?.description) : undefined) ||
  (snapshot.characteristic_name ? String(snapshot.characteristic_name) : undefined) ||
  (snapshot.characteristic?.description ? String(snapshot.characteristic?.description) : undefined) ||
  characteristicCode ||
  (characteristicId ? `Característica #${characteristicId}` : null);

return{index,productId,productCode:String(component.product_code??configuration.product.code??''),productName:String(component.product_name??configuration.product.commercial_description??configuration.product.technical_description??''),characteristicId,characteristicCode,characteristicName,quantity:numeric(component.quantity)??0,line:numeric(line?.value),output:numeric(output?.value),lineUnit:unitText(line,configuration),outputUnit:unitText(output,configuration),lineDimensionCode:line?.code??null,outputDimensionCode:output?.code??null,sourceComponent:component,productConfiguration:configuration} satisfies LonaConfectionComponent;}))).filter((component):component is LonaConfectionComponent=>component!==null);if(resolved.length===0)throw new CoreRepositoryError('La línea de pedido no contiene componentes confeccionables.');return{orderLineId:input.orderLineId,orderLineNo:input.orderLineNo,reference:input.reference??null,otdCode:snapshot.otd_code?String(snapshot.otd_code):null,components:resolved}}

/**
 * Crea la hoja con una línea por cada pieza asignada (paño o retal), no una única línea para
 * toda la necesidad. `p_quantity` sigue siendo "unidades terminadas que produce esta hoja"
 * (normalmente 1 toldo); el número de líneas ya no tiene que coincidir con ese valor, porque
 * una sola unidad terminada puede necesitar varias piezas físicas de material.
 */
export async function createLonaConfectionWorkSheet(input:{companyId:number;salesOrderId:number;salesOrderLineId:number;salesOrderLineNo:number;component:LonaConfectionComponent;allocations:LonaPieceAllocation[];reference?:string|null;selectionMode?:'AUTOMATIC'|'MANUAL';selectionReason?:string|null}):Promise<LonaConfectionWorkSheet>{
  const c=client();
  if(input.component.line==null||input.component.output==null)throw new CoreRepositoryError('La pieza no tiene dimensiones válidas para generar la hoja de confección.');
  if(!input.allocations.length)throw new CoreRepositoryError('No hay piezas de corte que generar.');
  const unresolved=input.allocations.filter(a=>!a.candidate);
  if(unresolved.length)throw new CoreRepositoryError(`No hay material disponible para ${unresolved.length} de las ${input.allocations.length} piezas de este corte.`);
  const selections=input.allocations.map(a=>{const candidate=a.candidate as LonaStockCandidate;return{stock_item_id:candidate.stockItemId,warehouse_id:candidate.warehouseId,source_dimension_values:candidate.sourceDimensions,source_dimension_units:candidate.sourceDimensionUnits,cut_dimension_values:candidate.cutDimensions,cut_dimension_units:candidate.cutDimensionUnits,remainder_dimension_values:candidate.remainderDimensions??[],remainder_dimension_units:candidate.remainderDimensionUnits,quantity:1,piece_label:a.label}});
  const firstCandidate=input.allocations[0].candidate as LonaStockCandidate;
  const{data,error}=await c.rpc('create_lona_confection_work_sheet',{p_company_id:input.companyId,p_sales_order_id:input.salesOrderId,p_sales_order_line_id:input.salesOrderLineId,p_sales_order_line_no:input.salesOrderLineNo,p_product_id:input.component.productId,p_product_code:input.component.productCode,p_product_name:input.component.productName,p_characteristic_id:firstCandidate.characteristicId,p_characteristic_code:firstCandidate.characteristicCode,p_characteristic_name:input.component.characteristicName,p_required_dimension_values:[input.component.line,input.component.output],p_required_dimension_units:[input.component.lineUnit,input.component.outputUnit],p_quantity:input.component.quantity,p_unit_symbol:input.component.lineUnit,p_unit_code:input.component.outputUnit,p_reference:input.reference??null,p_notes:`Hoja de confección generada a partir del OTD (${input.allocations.length} pieza${input.allocations.length===1?'':'s'} de material).`,p_selection_mode:input.selectionMode??'AUTOMATIC',p_selection_reason:input.selectionReason??input.allocations.map(a=>`${a.label}: ${a.candidate?.reason??''}`).join(' '),p_selections:selections});
  if(error)throw new CoreRepositoryError(error.message);
  const sheet=await getLonaConfectionWorkSheet(Number(data));
  if(!sheet)throw new CoreRepositoryError('La hoja de confección se ha creado pero no se ha podido recuperar.');
  return sheet;
}

export async function getLonaConfectionWorkSheet(id:number):Promise<LonaConfectionWorkSheet|null>{const c=client();const{data,error}=await c.from('production_work_sheet').select('id,code,issue_date,status,sales_order_line_id,product_code,product_name,characteristic_name,quantity,required_dimension_values,required_dimension_units,unit_symbol,selection_mode,selection_reason,lines:production_work_sheet_line(id,line_no,warehouse_code,warehouse_name,stock_item_id,source_dimension_values,source_dimension_units,cut_dimension_values,cut_dimension_units,quantity,remainder_dimension_values,remainder_dimension_units)').eq('id',id).eq('document_type','LONA_CONFECTION').maybeSingle();if(error)throw new CoreRepositoryError(error.message);if(!data)return null;return{id:Number(data.id),code:data.code,issueDate:data.issue_date,status:data.status,orderLineId:Number(data.sales_order_line_id),productCode:data.product_code??null,productName:data.product_name??null,characteristicName:data.characteristic_name??null,quantity:Number(data.quantity||0),requiredDimensions:Array.isArray(data.required_dimension_values)?data.required_dimension_values.map(Number):[],requiredDimensionUnits:asStringArray(data.required_dimension_units),unitSymbol:data.unit_symbol??null,selectionMode:data.selection_mode??null,selectionReason:data.selection_reason??null,lines:(data.lines??[]).map((line:any)=>({id:Number(line.id),lineNo:Number(line.line_no),warehouseCode:line.warehouse_code??null,warehouseName:line.warehouse_name??null,stockItemId:line.stock_item_id==null?null:Number(line.stock_item_id),sourceDimensions:Array.isArray(line.source_dimension_values)?line.source_dimension_values.map(Number):[],sourceDimensionUnits:asStringArray(line.source_dimension_units),cutDimensions:Array.isArray(line.cut_dimension_values)?line.cut_dimension_values.map(Number):[],cutDimensionUnits:asStringArray(line.cut_dimension_units),quantity:Number(line.quantity||0),remainderDimensions:Array.isArray(line.remainder_dimension_values)?line.remainder_dimension_values.map(Number):[],remainderDimensionUnits:asStringArray(line.remainder_dimension_units)}))};}
