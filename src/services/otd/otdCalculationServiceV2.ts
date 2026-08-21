import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { evaluateFormula, resolveOtdVariables, type FormulaEvaluationContext, type OtdVariableDefinition } from './formulaEngine';
import { resolveProductUnitPrice, round2 } from '../catalog/productPricingService';
import { listOtdScales, resolveOtdBasePriceFromScales, type OtdScaleRow } from './otdScaleRepository';
import { resolveComponentProduct } from './otdArticleResolutionService';
import type { Product, ProductCharacteristic } from '../catalog/productRepository';
import type { ProductScaleRow } from '../catalog/productCommercialRepository';

export type OtdModel = { id:number; company_id:number; code:string; name:string; template_type:string|null; active:boolean; product_id?:number|null; version?:number };
export type OtdSelectionOption = { id:number; selection_id:number; code:string; label:string; value:string|null; sort_order:number; product_id:number|null; product:Product|null };
export type OtdSelection = { id:number; otd_id:number; code:string; name:string; selection_type:'NUMBER'|'OPTION'|'TEXT'|'BOOLEAN'; required:boolean; is_dimension?:boolean; unit_id?:number|null; sort_order:number; options:OtdSelectionOption[] };
export type OtdVariable = OtdVariableDefinition & { id:number; otd_id:number; name:string; min_value:number|null; max_value:number|null; sort_order:number };
export type OtdDimensionDef = { code:string; name:string; dimension_number:number; unit_id:number|null; decimals:number };
export type OtdScale = ProductScaleRow & { product_id:number };
export type OtdComponentDef = {
  id:number; otd_id:number; code:string; product_id:number|null; product_selection_code:string|null; description:string|null;
  component_type:'BASIC'|'IMPROVEMENT'; quantity_expression:string|null; dimension_expressions:Record<string,string>;
  characteristic_id:number|null; characteristic_expression:string|null; price_increment:number; price_increment_type:'FIXED'|'PERCENTAGE';
  active:boolean; sort_order:number; product?:Product|null; dimensions?:OtdDimensionDef[]; scales?:OtdScale[]; characteristics?:ProductCharacteristic[];
};
export type OtdRuntimeData = { otd:OtdModel; selections:OtdSelection[]; variables:OtdVariable[]; components:OtdComponentDef[]; scales:OtdScaleRow[]; productsMap:Map<number,Product>; loadedAt:string };
export type OtdCalculatedComponent = {
  id:number; code:string; description:string; product_id:number|null; product_code:string; product_name:string;
  product_resolution_source:'FIXED'|'OPTION'|'MISSING'; product_selection_code:string|null;
  component_type:'BASIC'|'IMPROVEMENT'; quantity:number; quantity_expression:string|null;
  dimensions:Record<string,number>; dimension_expressions:Record<string,string>; dimension_list:Array<{code:string;name:string;value:number}>;
  characteristic_id:number|null; characteristic_code:string|null; characteristic_name:string|null; characteristic_expression:string|null;
  pricing_source:'base'|'characteristic'|'scale'|'scale_characteristic'|'manual';
  scale_step_used:{dimension_1:number;dimension_2:number|null;price:number}|null;
  base_price:number; price_increment:number; price_increment_type:'FIXED'|'PERCENTAGE'; increment_amount:number; unit_price:number; total_price:number; ok:boolean; formula_error?:string;
};
export type OtdCalculationResult = { inputs:Record<string,string|number|boolean|null>; resolvedVariables:FormulaEvaluationContext; components:OtdCalculatedComponent[]; otdBasePrice:number; otdScaleStepUsed:{dimension_1:number;dimension_2:number|null;price:number}|null; totalIncrements:number; totalAmount:number; isValid:boolean; requiredMissing:string[]; errors:string[] };
export type OtdSnapshotComponent = Omit<OtdCalculatedComponent,'ok'|'formula_error'> & { is_missing_price:boolean; missing_reason?:string };
export type OtdConfigurationSnapshot = {
  snapshot_version:'1.0'; created_at:string; otd_id:number; otd_code:string; otd_name:string; template_type:string|null;
  inputs:Record<string,string|number|boolean|null>; inputs_display:Array<{code:string;name:string;value:string|number|boolean|null;display_value:string;is_dimension?:boolean}>;
  variables:Record<string,number>; variables_display:Array<{code:string;name:string;value:number;expression:string|null}>;
  otd_base_price:number; otd_scale_step_used:{dimension_1:number;dimension_2:number|null;price:number}|null; total_increments:number; components:OtdSnapshotComponent[]; total_amount:number; notes?:string;
};

function client(){ if(!supabase) throw new CoreRepositoryError('Supabase no está inicializado.'); return supabase; }

function normalizeProductScales(rows:any[], productId:number):OtdScale[]{
  return (rows??[]).map(r=>({...r,product_id:productId,dimension_values:Array.isArray(r.dimension_values)&&r.dimension_values.length?r.dimension_values:[Number(r.dimension_1),...(r.dimension_2==null?[]:[Number(r.dimension_2)])],attribute_values:r.attribute_values&&typeof r.attribute_values==='object'?r.attribute_values:{}}));
}

export async function loadOtdRuntimeData(otdId:number):Promise<OtdRuntimeData>{
  const c=client();
  const [otdRes,selRes,varRes,compRes,otdScales]=await Promise.all([
    c.from('otd').select('*').eq('id',otdId).single(),
    c.from('otd_selection').select('*,otd_selection_option(*)').eq('otd_id',otdId).order('sort_order'),
    c.from('otd_variable').select('*').eq('otd_id',otdId).eq('active',true).order('sort_order'),
    c.from('otd_component').select('*').eq('otd_id',otdId).eq('active',true).order('sort_order'),
    listOtdScales(otdId),
  ]);
  if(otdRes.error) throw new CoreRepositoryError(otdRes.error.message);
  const rawSelections=(selRes.data??[]) as any[];
  const rawComps=(compRes.data??[]) as any[];
  const optionProductIds=rawSelections.flatMap(s=>(s.otd_selection_option??[]).map((o:any)=>o.product_id)).filter((x:any)=>Number.isFinite(Number(x))).map(Number);
  const fixedProductIds=rawComps.map(x=>x.product_id).filter((x:any)=>Number.isFinite(Number(x))).map(Number);
  const productIds=[...new Set([...optionProductIds,...fixedProductIds])];
  let products:Product[]=[]; let scales:any[]=[]; let chars:ProductCharacteristic[]=[]; let dimensions:any[]=[]; let familyMap:Record<number,any>={};
  if(productIds.length){
    const {data:p,error}=await c.from('product').select('*').in('id',productIds); if(error) throw new CoreRepositoryError(error.message); products=(p??[]) as Product[];
    const familyIds=[...new Set(products.map(p=>p.family_id).filter((x):x is number=>Number.isFinite(x)))];
    if(familyIds.length){const {data:f}=await c.from('product_family').select('id,measurement_type_id').in('id',familyIds);familyMap=Object.fromEntries((f??[]).map((x:any)=>[x.id,x]));}
    const mtIds=[...new Set(products.map(p=>Number.isFinite(p.measurement_type_id)?p.measurement_type_id:familyMap[p.family_id!]?.measurement_type_id).filter((x):x is number=>Number.isFinite(x)))];
    if(mtIds.length){const {data:d}=await c.from('measurement_type_dimension').select('measurement_type_id,dimension_number,code,name,unit_id,decimals').in('measurement_type_id',mtIds).order('dimension_number');dimensions=d??[];}
    const [sr,cr]=await Promise.all([
      c.from('product_scale').select('id,product_id,dimension_values,dimension_1,dimension_2,price,characteristic_id,attribute_values,deleted_at,deleted_by').in('product_id',productIds).is('deleted_at',null).order('dimension_1').order('dimension_2'),
      c.from('product_characteristic').select('*').in('product_id',productIds).eq('active',true).is('deleted_at',null).order('code'),
    ]);
    scales=sr.data??[]; chars=(cr.data??[]) as ProductCharacteristic[];
  }
  const productsMap=new Map(products.map(p=>[Number(p.id),p]));
  const byScale=new Map<number,OtdScale[]>(); for(const r of scales){const pid=Number(r.product_id);const a=byScale.get(pid)??[];a.push(...normalizeProductScales([r],pid));byScale.set(pid,a);}
  const byChar=new Map<number,ProductCharacteristic[]>(); for(const ch of chars){const pid=Number(ch.product_id);const a=byChar.get(pid)??[];a.push(ch);byChar.set(pid,a);}
  const getDims=(p:Product):OtdDimensionDef[]=>{const mt=Number.isFinite(p.measurement_type_id)?p.measurement_type_id:familyMap[p.family_id!]?.measurement_type_id??null;if(mt==null)return[];return dimensions.filter((d:any)=>Number(d.measurement_type_id)===Number(mt)).map((d:any)=>({code:String(d.code),name:String(d.name),dimension_number:Number(d.dimension_number),unit_id:d.unit_id==null?null:Number(d.unit_id),decimals:Number(d.decimals??0)}));};
  const selections:OtdSelection[]=rawSelections.map(s=>({id:Number(s.id),otd_id:Number(s.otd_id),code:String(s.code||''),name:String(s.name||s.code||''),selection_type:s.selection_type||'NUMBER',required:Boolean(s.required),is_dimension:Boolean(s.is_dimension),unit_id:s.unit_id==null?null:Number(s.unit_id),sort_order:Number(s.sort_order??0),options:(s.otd_selection_option??[]).map((o:any)=>({id:Number(o.id),selection_id:Number(o.selection_id),code:String(o.code||''),label:String(o.label||o.code||''),value:o.value!=null?String(o.value):null,sort_order:Number(o.sort_order??0),product_id:o.product_id==null?null:Number(o.product_id),product:o.product_id?productsMap.get(Number(o.product_id))??null:null}))}));
  const variables:OtdVariable[]=(varRes.data??[]).map((v:any)=>({id:Number(v.id),otd_id:Number(v.otd_id),code:String(v.code||''),name:String(v.name||v.code||''),expression:v.expression||null,data_type:v.data_type||'NUMBER',min_value:v.min_value==null?null:Number(v.min_value),max_value:v.max_value==null?null:Number(v.max_value),sort_order:Number(v.sort_order??0),active:Boolean(v.active)}));
  const components:OtdComponentDef[]=rawComps.map((x:any)=>{const p=x.product_id?productsMap.get(Number(x.product_id))??null:null;return{id:Number(x.id),otd_id:Number(x.otd_id),code:String(x.code||''),product_id:x.product_id==null?null:Number(x.product_id),product_selection_code:x.product_selection_code||null,description:x.description||null,component_type:x.component_type==='IMPROVEMENT'?'IMPROVEMENT':'BASIC',quantity_expression:x.quantity_expression||null,dimension_expressions:x.dimension_expressions&&typeof x.dimension_expressions==='object'?x.dimension_expressions:{},characteristic_id:x.characteristic_id?Number(x.characteristic_id):null,characteristic_expression:x.characteristic_expression||null,price_increment:Number(x.price_increment??0),price_increment_type:x.price_increment_type==='PERCENTAGE'?'PERCENTAGE':'FIXED',active:Boolean(x.active),sort_order:Number(x.sort_order??0),product:p,dimensions:p?getDims(p):[],scales:p?byScale.get(Number(p.id))??[]:[],characteristics:p?byChar.get(Number(p.id))??[]:[]};});
  return {otd:otdRes.data as OtdModel,selections,variables,components,scales:otdScales,productsMap,loadedAt:new Date().toISOString()};
}

export async function fetchProductForOtdComponent(productId:number){
  const c=client(); const {data:prod,error}=await c.from('product').select('*').eq('id',productId).single(); if(error||!prod)throw new CoreRepositoryError(error?.message||'Producto no encontrado');
  let mtId:number|null=null; if((prod as any).measurement_type_id)mtId=Number((prod as any).measurement_type_id); else if((prod as any).family_id){const {data:f}=await c.from('product_family').select('measurement_type_id').eq('id',(prod as any).family_id).single();mtId=f?.measurement_type_id?Number(f.measurement_type_id):null;}
  let dimensions:OtdDimensionDef[]=[]; if(mtId){const {data:d}=await c.from('measurement_type_dimension').select('measurement_type_id,dimension_number,code,name,unit_id,decimals').eq('measurement_type_id',mtId).order('dimension_number');dimensions=(d??[]).map((x:any)=>({code:String(x.code),name:String(x.name),dimension_number:Number(x.dimension_number),unit_id:x.unit_id==null?null:Number(x.unit_id),decimals:Number(x.decimals??0)}));}
  const [sr,cr]=await Promise.all([c.from('product_scale').select('id,product_id,dimension_values,dimension_1,dimension_2,price,characteristic_id,attribute_values,deleted_at,deleted_by').eq('product_id',productId).is('deleted_at',null).order('dimension_1').order('dimension_2'),c.from('product_characteristic').select('*').eq('product_id',productId).eq('active',true).is('deleted_at',null).order('code')]);
  return {product:prod as Product,dimensions,scales:normalizeProductScales(sr.data??[],productId),characteristics:(cr.data??[]) as ProductCharacteristic[]};
}

export function calculateOtdRuntime(runtimeData:OtdRuntimeData,rawValues:Record<string,string|number|boolean|null>):OtdCalculationResult{
  const {selections,variables,components,scales,productsMap}=runtimeData; const errors:string[]=[];const requiredMissing:string[]=[];const numeric:FormulaEvaluationContext={};const inputs:Record<string,string|number|boolean|null>={};const dimensionInputs:number[]=[];
  const optionBySelection=new Map<string,OtdSelectionOption|undefined>();
  for(const s of selections){const raw=rawValues[s.code];const present=raw!==null&&raw!==undefined&&String(raw).trim()!=='';if(s.required&&!present)requiredMissing.push(s.name||s.code);
    if(s.selection_type==='NUMBER'){const n=Number(raw);inputs[s.code]=Number.isFinite(n)?n:null;if(Number.isFinite(n)){numeric[s.code]=n;if(s.is_dimension)dimensionInputs.push(n);}}
    else if(s.selection_type==='BOOLEAN'){const b=raw===true||raw==='true'||raw==='1'||raw===1;inputs[s.code]=b;numeric[s.code]=b?1:0;}
    else if(s.selection_type==='OPTION'){inputs[s.code]=present?String(raw):null;const opt=s.options.find(o=>(o.value!=null&&String(o.value).trim()===String(raw).trim())||String(o.code).trim()===String(raw).trim()||String(o.label).trim()===String(raw).trim());optionBySelection.set(s.code,opt);for(const cand of [opt?.value,opt?.code,raw]){if(cand==null||String(cand).trim()==='')continue;const n=Number(cand);if(Number.isFinite(n)){numeric[s.code]=n;break;}const u=String(cand).toUpperCase();if(u==='SI'||u==='SÍ'||u==='TRUE'){numeric[s.code]=1;break;}if(u==='NO'||u==='FALSE'){numeric[s.code]=0;break;}}}
    else {inputs[s.code]=present?String(raw):null;const n=Number(raw);if(Number.isFinite(n))numeric[s.code]=n;}
  }
  let resolvedVariables:FormulaEvaluationContext={...numeric};try{resolvedVariables=resolveOtdVariables(variables,numeric);}catch(e:any){errors.push(`Error al resolver variables: ${e?.message||e}`);}
  let otdBasePrice=0;let otdScaleStepUsed:{dimension_1:number;dimension_2:number|null;price:number}|null=null;if(scales.length){const r=resolveOtdBasePriceFromScales(scales,dimensionInputs);if(r.found){otdBasePrice=r.basePrice;otdScaleStepUsed=r.scaleStep;}else if(dimensionInputs.length)errors.push('No se encontró escalón de precio en la matriz del OTD para las medidas seleccionadas.');}
  const calculated:OtdCalculatedComponent[]=[];
  for(const comp of components){if(!comp.active)continue;const resolution=resolveComponentProduct(comp,selections,rawValues,productsMap);const prod=resolution.product;const prodCode=prod?.code||comp.code;const prodName=prod?.commercial_description||prod?.technical_description||comp.description||comp.code;try{
      const quantity=Math.max(0,evaluateFormula(comp.quantity_expression||'1',resolvedVariables).value);const dimensions:Record<string,number>={};const dimensionList:Array<{code:string;name:string;value:number}>=[];
      for(const [code,expr] of Object.entries(comp.dimension_expressions??{})){if(!expr?.trim())continue;const value=Math.max(0,evaluateFormula(expr,resolvedVariables).value);dimensions[code]=value;const def=(prod?getProductDimensions(prod):comp.dimensions??[]).find(d=>d.code===code);dimensionList.push({code,name:def?.name||code,value});}
      const productDims=prod?getProductDimensions(prod):comp.dimensions??[];const ordered=productDims.map(d=>dimensions[d.code]??null);
      let resolvedChar:ProductCharacteristic|null=null;if(comp.characteristic_id)resolvedChar=(prod?((comp.characteristics??[]).find(ch=>ch.id===comp.characteristic_id)??null):null);else if(comp.characteristic_expression?.trim()){const expr=comp.characteristic_expression.trim();const value=inputs[expr]??rawValues[expr]??(Number.isFinite(resolvedVariables[expr])?String(resolvedVariables[expr]):expr);if(value!=null&&String(value).trim()!==''){const q=String(value).trim().toUpperCase();resolvedChar=(prod?((prodChars(prod,comp)).find(ch=>String(ch.id)===q||ch.code.toUpperCase()===q||(ch.description&&ch.description.toUpperCase()===q))??null):null);}}
      let basePrice=0;let pricingSource:'base'|'characteristic'|'scale'|'scale_characteristic'|'manual'='base';let scaleStepUsed:{dimension_1:number;dimension_2:number|null;price:number}|null=null;let ok=true;let formulaError:string|undefined;
      if(!prod){ok=false;formulaError=comp.product_selection_code?`La entrada '${comp.product_selection_code}' no tiene un artículo asociado a la opción seleccionada.`:'El componente no tiene un artículo asignado en el catálogo.';pricingSource='manual';}
      else if(scales.length){pricingSource='manual';}
      else {const pr=resolveProductUnitPrice({product:prod,characteristic:resolvedChar,dimension1:ordered[0]??null,dimension2:ordered[1]??null,scales:comp.scales??[],selectedAttributeValues:{}});basePrice=pr.price;pricingSource=pr.source;if(pr.scale)scaleStepUsed={dimension_1:Number(pr.scale.dimension_1),dimension_2:pr.scale.dimension_2==null?null:Number(pr.scale.dimension_2),price:Number(pr.scale.price)};if(pr.missing){ok=false;formulaError=pr.missingReason||'No se encontró escalado o precio para el artículo.';}}
      let incrementAmount=0;let unitPrice=basePrice;const inc=Number(comp.price_increment||0);if(inc>0){if(comp.price_increment_type==='PERCENTAGE'){const ref=scales.length?otdBasePrice:basePrice;incrementAmount=round2(ref*(inc/100));unitPrice=round2(basePrice+incrementAmount);}else{incrementAmount=inc;unitPrice=round2(basePrice+incrementAmount);}}
      const totalPrice=round2(unitPrice*quantity);calculated.push({id:comp.id,code:comp.code,description:comp.description||prodName,product_id:resolution.product_id,product_code:prodCode,product_name:prodName,product_resolution_source:resolution.source,product_selection_code:comp.product_selection_code,component_type:comp.component_type,quantity,quantity_expression:comp.quantity_expression,dimensions,dimension_expressions:comp.dimension_expressions,dimension_list,characteristic_id:resolvedChar?.id??comp.characteristic_id??null,characteristic_code:resolvedChar?.code??null,characteristic_name:resolvedChar?.description??null,characteristic_expression:comp.characteristic_expression,pricing_source:pricingSource,scale_step_used:scaleStepUsed,base_price:basePrice,price_increment:inc,price_increment_type:comp.price_increment_type,increment_amount:incrementAmount,unit_price:unitPrice,total_price:totalPrice,ok,formula_error:formulaError});
    }catch(e:any){calculated.push({id:comp.id,code:comp.code,description:comp.description||prodName,product_id:resolution.product_id,product_code:prodCode,product_name:prodName,product_resolution_source:resolution.source,product_selection_code:comp.product_selection_code,component_type:comp.component_type,quantity:0,quantity_expression:comp.quantity_expression,dimensions:{},dimension_expressions:comp.dimension_expressions,dimension_list:[],characteristic_id:null,characteristic_code:null,characteristic_name:null,characteristic_expression:comp.characteristic_expression,pricing_source:'manual',scale_step_used:null,base_price:0,price_increment:0,price_increment_type:'FIXED',increment_amount:0,unit_price:0,total_price:0,ok:false,formula_error:e?.message||'Error en el cálculo del componente'});}
  }
  const totalIncrements=scales.length?round2(calculated.reduce((s,c)=>s+(c.ok?c.total_price:0),0):0;const totalAmount=scales.length?round2(otdBasePrice+totalIncrements):round2(calculated.reduce((s,c)=>s+(c.ok?c.total_price:0),0));
  const isValid=requiredMissing.length===0&&errors.length===0&&(scales.length===0||otdBasePrice>0||scales.some(s=>s.price===0))&&calculated.every(c=>c.ok);
  return {inputs,resolvedVariables,components:calculated,otdBasePrice,otdScaleStepUsed,totalIncrements,totalAmount,isValid,requiredMissing,errors};
}

function getProductDimensions(p:Product):OtdDimensionDef[]{const mt=(p as any).measurement_type?.dimensions??[];return mt.map((d:any)=>({code:String(d.code),name:String(d.name),dimension_number:Number(d.dimension_number??d.sort_order??0),unit_id:d.unit_id==null?null:Number(d.unit_id),decimals:Number(d.decimals??0)}));}
function prodChars(p:Product,comp:OtdComponentDef){return comp.characteristics??[];}

export function buildOtdConfigurationSnapshot(runtimeData:OtdRuntimeData,calcResult:OtdCalculationResult,customNotes?:string):OtdConfigurationSnapshot{
  const {otd,selections,variables}=runtimeData;const inputsDisplay=selections.map(s=>{const v=calcResult.inputs[s.code];let display=v==null?'—':String(v);if(s.selection_type==='OPTION'){const o=s.options.find(x=>(x.value??x.code)===String(v));if(o)display=o.label||o.code;}else if(s.selection_type==='BOOLEAN')display=v?'Sí':'No';else if(s.selection_type==='NUMBER'&&typeof v==='number')display=v.toLocaleString('es-ES');return{code:s.code,name:s.name||s.code,value:v??null,display_value:display,is_dimension:s.is_dimension};});
  return {snapshot_version:'1.0',created_at:new Date().toISOString(),otd_id:otd.id,otd_code:otd.code,otd_name:otd.name,template_type:otd.template_type,inputs:calcResult.inputs,inputs_display:inputsDisplay,variables:calcResult.resolvedVariables,variables_display:variables.map(v=>({code:v.code,name:v.name||v.code,value:calcResult.resolvedVariables[v.code]??0,expression:v.expression})),otd_base_price:calcResult.otdBasePrice,otd_scale_step_used:calcResult.otdScaleStepUsed,total_increments:calcResult.totalIncrements,components:calcResult.components.map(c=>({...c,is_missing_price:!c.ok,missing_reason:c.formula_error})),total_amount:calcResult.totalAmount,notes:customNotes};
}
