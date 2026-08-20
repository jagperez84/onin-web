import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type StockItemAvailability = {
  productId:number; productCode:string; productName:string; characteristicId?:number|null; characteristicCode?:string|null;
  warehouseId:number|null; warehouseName:string; inStock:number; reserved:number; available:number; stockMinimum:number; requiredQuantity:number;
  hasSufficientStock:boolean; status:'available'|'low_stock'|'out_of_stock'|'untracked';
  dimensional:boolean; matchingStockItemIds:number[]; matchingDimensions:number[][];
};
export type StockAvailabilityPreview={mainProduct:StockItemAvailability;componentsStock:StockItemAvailability[];overallStatus:'available'|'low_stock'|'out_of_stock'|'untracked';warehouseName:string;checkedAt:string};
function client(){if(!supabase)throw new CoreRepositoryError('Supabase no está configurado.');return supabase;}
function normalized(values:any):number[]{return Array.isArray(values)?values.map(Number).filter(Number.isFinite):[];}
function dimensionsCompatible(available:number[],required:number[],recuttable:boolean):boolean{
 if(!required.length)return true;
 if(available.length!==required.length)return false;
 return required.every((value,i)=>recuttable?available[i]>=value:available[i]===value);
}

export async function checkStockAvailability(input:{companyId:number;warehouseId?:number|null;productId:number;productCode:string;productName:string;stockEnabled:boolean;stockMinimum?:number;characteristicId?:number|null;characteristicCode?:string|null;quantity:number;dimensionValues?:number[];includeMeasurementsInStock?:boolean;recuttable?:boolean;components?:Array<{productId?:number|null;productCode?:string|null;productName?:string|null;characteristicId?:number|null;requiredQuantity:number;dimensionValues?:number[];includeMeasurementsInStock?:boolean;recuttable?:boolean}>;}):Promise<StockAvailabilityPreview>{
 const {companyId,warehouseId,productId,productCode,productName,stockEnabled,stockMinimum=0,characteristicId,characteristicCode,quantity,dimensionValues=[],includeMeasurementsInStock=false,recuttable=false,components=[]}=input;
 if(!stockEnabled){const item:StockItemAvailability={productId,productCode,productName,characteristicId,characteristicCode,warehouseId:warehouseId??null,warehouseName:'Sin almacén',inStock:0,reserved:0,available:0,stockMinimum:0,requiredQuantity:quantity,hasSufficientStock:true,status:'untracked',dimensional:false,matchingStockItemIds:[],matchingDimensions:[]};return{mainProduct:item,componentsStock:[],overallStatus:'untracked',warehouseName:'Sin control de stock',checkedAt:new Date().toISOString()};}
 const c=client();let warehouseName='Almacén principal';if(warehouseId){const {data}=await c.from('warehouse').select('name').eq('id',warehouseId).maybeSingle();if(data?.name)warehouseName=data.name;}
 const allProductIds=[productId,...components.map(x=>x.productId).filter((id):id is number=>id!=null)];
 const query=c.from('warehouse_stock').select('warehouse_id,product_id,characteristic_id,quantity,reserved_quantity,warehouse(id,name),product(id,code,commercial_description,stock_minimum)').in('product_id',allProductIds);
 const scoped=warehouseId?query.eq('warehouse_id',warehouseId):query;
 const {data:stockRows,error}=await scoped;if(error)throw new CoreRepositoryError(error.message);const balances=(stockRows??[])as any[];
 const dimensionalProducts=[{productId,characteristicId,dimensionValues,includeMeasurementsInStock,recuttable},...components.map(x=>({productId:x.productId??0,characteristicId:x.characteristicId??null,dimensionValues:x.dimensionValues??[],includeMeasurementsInStock:x.includeMeasurementsInStock??false,recuttable:x.recuttable??false}))].filter(x=>x.includeMeasurementsInStock&&x.productId>0);
 const dimensionalIds=[...new Set(dimensionalProducts.map(x=>x.productId))];let stockItems:any[]=[];
 if(dimensionalIds.length){let itemQuery=c.from('warehouse_stock_item').select('id,warehouse_stock_id,product_id,characteristic_id,quantity,dimension_values,status,warehouse_stock!inner(warehouse_id,reserved_quantity)').in('product_id',dimensionalIds).eq('status','AVAILABLE');if(warehouseId)itemQuery=itemQuery.eq('warehouse_stock.warehouse_id',warehouseId);const res=await itemQuery;if(res.error)throw new CoreRepositoryError(res.error.message);stockItems=(res.data??[])as any[];}
 function evaluate(productIdX:number,characteristicIdX:number|null,requiredQuantity:number,stockMinimumX:number,requestedDims:number[],dimensional:boolean,recuttableX:boolean,code:string,name:string):StockItemAvailability{
  const base=balances.filter(b=>b.product_id===productIdX&&(characteristicIdX==null||b.characteristic_id===characteristicIdX||b.characteristic_id==null));
  if(dimensional){const matches=stockItems.filter(item=>item.product_id===productIdX&&(characteristicIdX==null||item.characteristic_id===characteristicIdX||item.characteristic_id==null)&&dimensionsCompatible(normalized(item.dimension_values),requestedDims,recuttableX));const available=matches.reduce((sum,x)=>sum+Number(x.quantity??0),0);const sufficient=available>=requiredQuantity;let status:StockItemAvailability['status']=sufficient?'available':available>0?'low_stock':'out_of_stock';if(sufficient&&available-requiredQuantity<stockMinimumX)status='low_stock';return{productId:productIdX,productCode:code,productName:name,characteristicId:characteristicIdX,warehouseId:warehouseId??null,warehouseName,inStock:available,reserved:0,available,stockMinimum:stockMinimumX,requiredQuantity,hasSufficientStock:sufficient,status,dimensional:true,matchingStockItemIds:matches.map(x=>Number(x.id)),matchingDimensions:matches.map(x=>normalized(x.dimension_values))};}
  const inStock=base.reduce((s,x)=>s+Number(x.quantity??0),0);const reserved=base.reduce((s,x)=>s+Number(x.reserved_quantity??0),0);const available=Math.max(0,inStock-reserved);const sufficient=available>=requiredQuantity;let status:StockItemAvailability['status']=sufficient?'available':available>0?'low_stock':'out_of_stock';if(sufficient&&available-requiredQuantity<stockMinimumX)status='low_stock';return{productId:productIdX,productCode:code,productName:name,characteristicId:characteristicIdX,warehouseId:warehouseId??null,warehouseName,inStock,reserved,available,stockMinimum:stockMinimumX,requiredQuantity,hasSufficientStock:sufficient,status,dimensional:false,matchingStockItemIds:[],matchingDimensions:[]};
 }
 const main=evaluate(productId,characteristicId,quantity,stockMinimum,dimensionValues,includeMeasurementsInStock,recuttable,productCode,productName);
 const componentsStock=components.filter(cmp=>cmp.productId!=null).map(cmp=>evaluate(Number(cmp.productId),cmp.characteristicId??null,cmp.requiredQuantity,0,cmp.dimensionValues??[],Boolean(cmp.includeMeasurementsInStock),Boolean(cmp.recuttable),cmp.productCode||`P-${cmp.productId}`,cmp.productName||`Componente ${cmp.productId}`));
 const all=[main,...componentsStock];const overallStatus=all.some(x=>x.status==='out_of_stock')?'out_of_stock':all.some(x=>x.status==='low_stock')?'low_stock':all.every(x=>x.status==='untracked')?'untracked':'available';
 return{mainProduct:main,componentsStock,overallStatus,warehouseName,checkedAt:new Date().toISOString()};
}
