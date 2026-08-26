import { supabase } from '../../lib/supabase';
import { loadMasterProductConfiguration } from '../catalog/productConfigurationService';
import type { MasterProductConfiguration } from '../catalog/productConfigurationService';
import { CoreRepositoryError } from '../core/coreRepository';

export type LonaConfectionComponent = {
  index: number;
  productId: number;
  productCode: string;
  productName: string;
  characteristicName: string | null;
  quantity: number;
  line: number | null;
  output: number | null;
  lineUnit: string | null;
  outputUnit: string | null;
  lineDimensionCode: string | null;
  outputDimensionCode: string | null;
  sourceComponent: OtdComponentSnapshot;
  productConfiguration: MasterProductConfiguration;
};

export type LonaCutGeometry = { width: number; height: number; widthLabel: string; heightLabel: string };

export type LonaStockCandidate = {
  stockItemId: number;
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  productId: number;
  characteristicId: number | null;
  characteristicCode: string | null;
  quantity: number;
  sourceDimensions: number[];
  cutDimensions: [number, number];
  remainderDimensions: [number, number] | null;
  rotated: boolean;
  score: number;
  reason: string;
};

export type LonaConfectionResult = {
  orderLineId: number;
  orderLineNo: number;
  reference: string | null;
  otdCode: string | null;
  components: LonaConfectionComponent[];
};

type OtdDimensionSnapshot = { code?: string | null; name?: string | null; value?: unknown; unit_id?: number | null; unit_symbol?: string | null; unit_code?: string | null };
type OtdComponentSnapshot = { product_id?: unknown; product_code?: unknown; product_name?: unknown; characteristic_name?: unknown; characteristic_code?: unknown; quantity?: unknown; dimension_list?: OtdDimensionSnapshot[]; dimensions?: Record<string, unknown> };
type OtdSnapshot = { otd_code?: unknown; components?: OtdComponentSnapshot[]; dimensions?: OtdDimensionSnapshot[] };
type DimensionValue = OtdDimensionSnapshot;

function client(){if(!supabase)throw new CoreRepositoryError('Supabase no está configurado.');return supabase}
function numeric(value: unknown): number | null { const n=Number(value); return Number.isFinite(n)?n:null; }
function componentDimensions(component: OtdComponentSnapshot, snapshot: OtdSnapshot): DimensionValue[] {
  if (Array.isArray(component.dimension_list) && component.dimension_list.length) return component.dimension_list;
  if (component.dimensions && typeof component.dimensions==='object') {
    const entries=Object.entries(component.dimensions).map(([code,value])=>({code,value} as OtdDimensionSnapshot));
    if(entries.length)return entries;
  }
  return Array.isArray(snapshot.dimensions)?snapshot.dimensions:[];
}
function resolveDimensionUnit(dimension: DimensionValue|undefined, configuration: MasterProductConfiguration): string|null {
  if(!dimension)return null;
  if(dimension.unit_symbol)return dimension.unit_symbol;
  if(dimension.unit_code)return dimension.unit_code;
  if(dimension.unit_id!=null){const unit=configuration.unitsMap.get(Number(dimension.unit_id));if(unit)return unit.code||unit.name;}
  const definition=configuration.dimensions.find(candidate=>(dimension.code&&candidate.code===dimension.code)||(dimension.name&&candidate.name===dimension.name));
  if(definition?.unit_id!=null){const unit=configuration.unitsMap.get(Number(definition.unit_id));if(unit)return unit.code||unit.name;}
  return null;
}
function dimensionText(dimension: DimensionValue|undefined): string { return `${dimension?.code??''} ${dimension?.name??''}`.trim().toLowerCase(); }
function resolveCutDimensions(dimensions: DimensionValue[]): {line:DimensionValue|undefined;output:DimensionValue|undefined} {
  if(dimensions.length<2)return{line:dimensions[0],output:undefined};
  const lineIndex=dimensions.findIndex(d=>(/(^|\b)(linea|línea|ancho|width)(\b|$)/i).test(dimensionText(d)));
  const outputIndex=dimensions.findIndex(d=>(/(^|\b)(salida|alto|altura|height)(\b|$)/i).test(dimensionText(d)));
  if(lineIndex>=0&&outputIndex>=0&&lineIndex!==outputIndex)return{line:dimensions[lineIndex],output:dimensions[outputIndex]};
  return{line:dimensions[0],output:dimensions[1]};
}
function getGeometry(component:LonaConfectionComponent):LonaCutGeometry|null {
  const dimensions=component.sourceComponent.dimension_list?.length?component.sourceComponent.dimension_list:Object.entries(component.sourceComponent.dimensions??{}).map(([code,value])=>({code,value} as OtdDimensionSnapshot));
  const{line,output}=resolveCutDimensions(dimensions);const width=numeric(line?.value);const height=numeric(output?.value);if(width==null||height==null||width<=0||height<=0)return null;
  return{width,height,widthLabel:`${line?.code??line?.name??'Línea'}${component.lineUnit?` (${component.lineUnit})`:''}`,heightLabel:`${output?.code??output?.name??'Salida'}${component.outputUnit?` (${component.outputUnit})`:''}`};
}
export function getLonaCutGeometry(component:LonaConfectionComponent):LonaCutGeometry|null{return getGeometry(component)}

export async function listLonaStockCandidates(input:{companyId:number;productId:number;characteristicCode?:string|null;requiredLine:number;requiredOutput:number}):Promise<LonaStockCandidate[]> {
  const c=client();
  const{data,error}=await c.from('warehouse_stock_item').select('id,product_id,characteristic_id,quantity,dimension_values,status,warehouse_stock:warehouse_stock_id(warehouse_id,warehouse:warehouse(code,name)),characteristic:product_characteristic(code)').eq('product_id',input.productId).gt('quantity',0).eq('status','AVAILABLE').order('created_at',{ascending:true}).limit(500);
  if(error)throw new CoreRepositoryError(error.message);
  const requestedCharacteristic=input.characteristicCode??null;
  const result:LonaStockCandidate[]=[];
  for(const row of data??[]){
    const r=row as any;const characteristicCode=r.characteristic?.code??null;
    if(characteristicCode!==requestedCharacteristic)continue;
    const dimensions=Array.isArray(r.dimension_values)?r.dimension_values.map(Number).filter(Number.isFinite):[];
    if(dimensions.length<2)continue;
    const direct=dimensions[0]>=input.requiredLine&&dimensions[1]>=input.requiredOutput;
    const rotated=dimensions[0]>=input.requiredOutput&&dimensions[1]>=input.requiredLine;
    if(!direct&&!rotated)continue;
    const useRotated=!direct&&rotated;
    const cut:[number,number]=useRotated?[input.requiredOutput,input.requiredLine]:[input.requiredLine,input.requiredOutput];
    const remainder:[number,number]=[dimensions[0]-cut[0],dimensions[1]-cut[1]];
    const waste=Math.max(0,remainder[0])*Math.max(0,remainder[1]);
    const score=(useRotated?100000:0)+waste;
    result.push({stockItemId:Number(r.id),warehouseId:Number(r.warehouse_stock?.warehouse_id),warehouseCode:r.warehouse_stock?.warehouse?.code??'—',warehouseName:r.warehouse_stock?.warehouse?.name??'—',productId:Number(r.product_id),characteristicId:r.characteristic_id==null?null:Number(r.characteristic_id),characteristicCode,quantity:Number(r.quantity||0),sourceDimensions:dimensions,cutDimensions:cut,remainderDimensions:remainder,rotated:useRotated,score,reason:useRotated?'Material compatible girando la pieza.':'Material compatible en la orientación original.'});
  }
  return result.sort((a,b)=>a.score-b.score||a.sourceDimensions.reduce((x,y)=>x+y,0)-b.sourceDimensions.reduce((x,y)=>x+y,0));
}

export async function resolveLonaConfectionComponents(input:{companyId:number;orderLineId:number;orderLineNo:number;reference?:string|null;snapshot:OtdSnapshot}):Promise<LonaConfectionResult>{
  const snapshot=input.snapshot??{};const rawComponents=Array.isArray(snapshot.components)?snapshot.components:[];const candidates=rawComponents.map((component,index)=>({component,index})).filter(({component})=>Number(component.product_id)>0);
  const resolved=(await Promise.all(candidates.map(async({component,index})=>{const productId=Number(component.product_id);const configuration=await loadMasterProductConfiguration(productId,input.companyId);if(!configuration.family?.confectionable)return null;const dimensions=componentDimensions(component,snapshot);const{line,output}=resolveCutDimensions(dimensions);return{index,productId,productCode:String(component.product_code??configuration.product.code??''),productName:String(component.product_name??configuration.product.commercial_description??configuration.product.technical_description??''),characteristicName:component.characteristic_name?String(component.characteristic_name):null,quantity:numeric(component.quantity)??0,line:numeric(line?.value),output:numeric(output?.value),lineUnit:resolveDimensionUnit(line,configuration),outputUnit:resolveDimensionUnit(output,configuration),lineDimensionCode:line?.code??null,outputDimensionCode:output?.code??null,sourceComponent:component,productConfiguration:configuration} satisfies LonaConfectionComponent;}))).filter((component):component is LonaConfectionComponent=>component!==null);
  if(resolved.length===0)throw new CoreRepositoryError('La línea de pedido no contiene componentes confeccionables.');
  return{orderLineId:input.orderLineId,orderLineNo:input.orderLineNo,reference:input.reference??null,otdCode:snapshot.otd_code?String(snapshot.otd_code):null,components:resolved};
}
