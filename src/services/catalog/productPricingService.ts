import type { Product, ProductCharacteristic } from './productRepository';
import type { ProductScaleRow } from './productCommercialRepository';

export type PricingSource = 'base' | 'characteristic_pvp' | 'scale' | 'scale_characteristic' | 'manual';
export type CharacteristicIncrementItem = { id?: number; code: string; name: string; amount: number; type: 'attribute' | 'variant' };
export type LinePriceCalculation = {
  base_price:number; pricing_source:PricingSource; price_missing:boolean; price_missing_reason?:string;
  scale_used?:{id?:number;dimension_1:number;dimension_2:number|null;price:number;characteristic_id:number|null;characteristic_code?:string|null}|null;
  characteristic_increments:CharacteristicIncrementItem[]; total_increments:number; price_before_discount:number; discount_percent:number; discount_amount:number; unit_price:number; quantity:number; subtotal_gross:number; net_amount:number; tax_percent:number; tax_amount:number; total_amount:number;
  explainable_steps:Array<{label:string;description?:string;amount:number;formatted:string;highlight?:boolean;badge?:string}>;
};
export type CalculateLinePricingInput = {
  product:Product; characteristic?:ProductCharacteristic|null; selectedAttributeIncrements?:CharacteristicIncrementItem[];
  selectedAttributeValues?:Record<string,number|string|boolean|null>; dimensions?:Record<string,number|null>; scales?:ProductScaleRow[]; quantity:number; discount_percent:number; tax_percent?:number;
};
export function round2(value:number):number{return Math.round((value+Number.EPSILON)*100)/100;}
export function formatEuro(value:number):string{return value.toLocaleString('es-ES',{style:'currency',currency:'EUR'});}

function scaleMatchesAttributes(row:ProductScaleRow, selected:Record<string,number|string|boolean|null>):boolean{
  const values=row.attribute_values&&typeof row.attribute_values==='object'?row.attribute_values:{};
  return Object.entries(values).every(([attributeId,value])=>String(selected[attributeId]??'')===String(value??''));
}

export function resolveProductUnitPrice(input:{product:Product;characteristic?:ProductCharacteristic|null;dimension1?:number|null;dimension2?:number|null;scales?:ProductScaleRow[];selectedAttributeValues?:Record<string,number|string|boolean|null>}):{price:number;source:'base'|'characteristic'|'scale'|'scale_characteristic';scale?:ProductScaleRow;missing:boolean;missingReason?:string}{
  const {product,characteristic,scales=[],selectedAttributeValues={}}=input;
  const dim1=Math.trunc(input.dimension1??0); const dim2=Math.trunc(input.dimension2??0);
  if(product.scaled||product.scaled_by_characteristic){
    const characteristicId=product.scaled_by_characteristic?characteristic?.id??null:null;
    const candidates=scales
      .filter(row=>product.scaled_by_characteristic ? row.characteristic_id===characteristicId : true)
      .filter(row=>scaleMatchesAttributes(row,selectedAttributeValues))
      .filter(row=>Number(row.dimension_1)>=dim1)
      .filter(row=>row.dimension_2==null||Number(row.dimension_2)>=dim2)
      .sort((a,b)=>Object.keys(b.attribute_values??{}).length-Object.keys(a.attribute_values??{}).length||Number(a.dimension_1)-Number(b.dimension_1)||(Number(a.dimension_2??0)-Number(b.dimension_2??0)));
    const scale=candidates[0];
    if(scale)return{price:round2(Number(scale.price)),source:product.scaled_by_characteristic?'scale_characteristic':'scale',scale,missing:false};
    return{price:0,source:product.scaled_by_characteristic?'scale_characteristic':'scale',missing:true,missingReason:'No existe un precio de escalado para la combinación de dimensiones y características seleccionada.'};
  }
  if(characteristic?.pvp!=null&&Number(characteristic.pvp)>0)return{price:round2(Number(characteristic.pvp)),source:'characteristic',missing:false};
  return{price:round2(Number(product.sales_price??0)),source:'base',missing:false};
}

export function calculateLinePricing(input:CalculateLinePricingInput):LinePriceCalculation{
  const {product,characteristic,selectedAttributeIncrements=[],selectedAttributeValues={},dimensions={},scales=[],quantity=1,discount_percent=0,tax_percent=0}=input;
  const dimValues=Object.values(dimensions).filter((v):v is number=>v!=null&&Number.isFinite(v)); const dim1=dimValues[0]??null; const dim2=dimValues[1]??null;
  const resolved=resolveProductUnitPrice({product,characteristic,dimension1:dim1,dimension2:dim2,scales,selectedAttributeValues});
  const basePrice=resolved.price;
  const pricingSource:PricingSource=resolved.source==='scale_characteristic'?'scale_characteristic':resolved.source==='scale'?'scale':resolved.source==='characteristic'?'characteristic_pvp':'base';
  const increments:CharacteristicIncrementItem[]=[];
  if(characteristic?.price_increment&&Number(characteristic.price_increment)>0)increments.push({id:characteristic.id,code:characteristic.code,name:`Variante: ${characteristic.description||characteristic.code}`,amount:round2(Number(characteristic.price_increment)),type:'variant'});
  if(product.price_increment&&Number(product.price_increment)>0&&!characteristic?.price_increment)increments.push({code:'PROD_INC',name:'Incremento base del artículo',amount:round2(Number(product.price_increment)),type:'attribute'});
  for(const inc of selectedAttributeIncrements)if(inc.amount>0)increments.push(inc);
  const totalIncrements=round2(increments.reduce((sum,item)=>sum+item.amount,0));
  const priceBeforeDiscount=round2(basePrice+totalIncrements); const discPercentClamped=Math.min(100,Math.max(0,discount_percent)); const discountAmount=round2(priceBeforeDiscount*(discPercentClamped/100));
  const unitPrice=round2(Math.max(0,priceBeforeDiscount-discountAmount)); const safeQuantity=Math.max(0,quantity); const subtotalGross=round2(safeQuantity*priceBeforeDiscount); const netAmount=round2(safeQuantity*unitPrice); const safeTaxPercent=Math.max(0,tax_percent); const taxAmount=round2(netAmount*(safeTaxPercent/100)); const totalAmount=round2(netAmount+taxAmount);
  const explainableSteps:LinePriceCalculation['explainable_steps']=[{label:resolved.missing?'Precio pendiente de escalado':pricingSource==='scale'?`Escalado artículo (${dim1??0} × ${dim2??0})`:pricingSource==='scale_characteristic'?`Escalado variante ${characteristic?.code??''} (${dim1??0} × ${dim2??0})`:pricingSource==='characteristic_pvp'?`PVP Variante (${characteristic?.code??''})`:'Precio base artículo',description:resolved.missing?resolved.missingReason:resolved.scale?`Escalón hasta ${resolved.scale.dimension_1} × ${resolved.scale.dimension_2??'—'}`:undefined,amount:basePrice,formatted:formatEuro(basePrice),highlight:true,badge:resolved.missing?'Pendiente':pricingSource==='scale'||pricingSource==='scale_characteristic'?'Escalado':pricingSource==='characteristic_pvp'?'PVP Variante':'Base'}];
  if(totalIncrements>0)for(const inc of increments)explainableSteps.push({label:`+ ${inc.name}`,amount:inc.amount,formatted:`+ ${formatEuro(inc.amount)}`,badge:'Incremento'});
  if(totalIncrements>0)explainableSteps.push({label:'Precio antes de descuento',amount:priceBeforeDiscount,formatted:formatEuro(priceBeforeDiscount),highlight:true});
  if(discPercentClamped>0)explainableSteps.push({label:`Descuento ${discPercentClamped} %`,description:`-${formatEuro(discountAmount)} por unidad`,amount:-discountAmount,formatted:`- ${formatEuro(discountAmount)}`,badge:`${discPercentClamped}% Dto.`});
  explainableSteps.push({label:'Precio unitario final',amount:unitPrice,formatted:formatEuro(unitPrice),highlight:true}); explainableSteps.push({label:`Cantidad (× ${safeQuantity.toLocaleString('es-ES')})`,amount:netAmount,formatted:formatEuro(netAmount)});
  if(safeTaxPercent>0)explainableSteps.push({label:`IVA (${safeTaxPercent} %)`,amount:taxAmount,formatted:`+ ${formatEuro(taxAmount)}`});
  explainableSteps.push({label:'Importe total línea',amount:totalAmount,formatted:formatEuro(totalAmount),highlight:true});
  return{base_price:basePrice,pricing_source:pricingSource,price_missing:resolved.missing,price_missing_reason:resolved.missingReason,scale_used:resolved.scale?{id:resolved.scale.id,dimension_1:resolved.scale.dimension_1,dimension_2:resolved.scale.dimension_2,price:Number(resolved.scale.price),characteristic_id:resolved.scale.characteristic_id,characteristic_code:resolved.scale.characteristic_code??null}:null,characteristic_increments:increments,total_increments:totalIncrements,price_before_discount:priceBeforeDiscount,discount_percent:discPercentClamped,discount_amount:discountAmount,unit_price:unitPrice,quantity:safeQuantity,subtotal_gross:subtotalGross,net_amount:netAmount,tax_percent:safeTaxPercent,tax_amount:taxAmount,total_amount:totalAmount,explainable_steps:explainableSteps};
}
