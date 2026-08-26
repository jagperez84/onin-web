import type { Product, ProductCharacteristic } from './productRepository';
import type { ProductScaleRow } from './productCommercialRepository';
import { resolveProductUnitPrice } from './productPricingService';

export type BreakdownRoundingMode = 'HALF_UP' | 'UP' | 'DOWN';
export type BreakdownComponent = {
  id:number; code:string; description?:string|null; quantity_expression?:string|null;
  unit_id?:number|null; base_price?:number|null; add_pvp?:boolean; add_increment?:boolean;
  rounding_decimals?:number; rounding_mode?:BreakdownRoundingMode; cost?:number|null; price?:number|null;
  product?:Product|null; characteristic?:ProductCharacteristic|null; scales?:ProductScaleRow[];
  dimension1?:number|null; dimension2?:number|null;
};
export type BreakdownComponentResult = {
  id:number; code:string; description:string|null; quantity:number; unit_id:number|null;
  unit_price:number; unit_cost:number; total_price:number; total_cost:number;
  add_pvp:boolean; add_increment:boolean;
};
export type BreakdownCalculationResult = { components:BreakdownComponentResult[]; price:number; cost:number };

export class BreakdownCalculationError extends Error {
  constructor(message:string){ super(message); this.name='BreakdownCalculationError'; }
}

export function calculateBreakdown(input:{variables?:Record<string,number>;components:BreakdownComponent[]}):BreakdownCalculationResult {
  const context={...(input.variables??{})};
  const results:BreakdownComponentResult[]=[];
  for(const component of [...input.components].sort((a,b)=>a.id-b.id)){
    const expression=component.quantity_expression?.trim();
    const quantity=expression?evaluateExpression(expression,context):1;
    if(!Number.isFinite(quantity)) throw new BreakdownCalculationError(`Cantidad no válida en ${component.code}.`);
    context[component.code]=quantity;
    const resolved=resolveComponentPrice(component);
    const decimals=clampDecimals(component.rounding_decimals??2);
    const mode=component.rounding_mode??'HALF_UP';
    const unitPrice=round(resolved.price,decimals,mode);
    const unitCost=round(resolved.cost,decimals,mode);
    const totalPrice=round(quantity*unitPrice,decimals,mode);
    const totalCost=round(quantity*unitCost,decimals,mode);
    results.push({id:component.id,code:component.code,description:component.description??null,quantity,
      unit_id:component.unit_id??component.product?.base_unit_id??null,unit_price:unitPrice,unit_cost:unitCost,
      total_price:totalPrice,total_cost:totalCost,add_pvp:!!component.add_pvp,add_increment:!!component.add_increment});
  }
  return {
    components:results,
    price:round(results.filter(x=>x.add_pvp||x.add_increment).reduce((s,x)=>s+x.total_price,0),2,'HALF_UP'),
    cost:round(results.reduce((s,x)=>s+x.total_cost,0),2,'HALF_UP')
  };
}

function resolveComponentPrice(c:BreakdownComponent):{price:number;cost:number}{
  if(!c.product){
    const price=Number(c.base_price??c.price??0); const cost=Number(c.cost??price);
    if(!Number.isFinite(price)||!Number.isFinite(cost)) throw new BreakdownCalculationError(`Precio no válido en ${c.code}.`);
    return {price,cost};
  }
  const pricing=resolveProductUnitPrice({product:c.product,characteristic:c.characteristic,dimension1:c.dimension1,dimension2:c.dimension2,scales:c.scales??[]});
  let price=pricing.price;
  if(c.base_price!=null&&!c.product.scaled&&!c.product.scaled_by_characteristic) price=Number(c.base_price);
  if(c.add_increment) price+=Number(c.product.price_increment??0);
  const cost=c.cost!=null?Number(c.cost):Number(c.product.purchase_price??0);
  return {price,cost};
}

export function evaluateExpression(expression:string,variables:Record<string,number>={}):number{
  const value=new ExpressionParser(expression,variables).parse();
  if(!Number.isFinite(value)) throw new BreakdownCalculationError(`La expresión "${expression}" no produce un número válido.`);
  return value;
}

class ExpressionParser{
  private position=0;
  constructor(private readonly source:string,private readonly variables:Record<string,number>){ }
  parse(){const value=this.parseAdditive();this.skip();if(this.position!==this.source.length)throw new BreakdownCalculationError(`Expresión no válida: "${this.source}".`);return value;}
  private parseAdditive():number{let v=this.parseMultiplicative();while(true){this.skip();const op=this.source[this.position];if(op!=='+'&&op!=='-')return v;this.position++;const r=this.parseMultiplicative();v=op==='+'?v+r:v-r;}}
  private parseMultiplicative():number{let v=this.parseUnary();while(true){this.skip();const op=this.source[this.position];if(op!=='*'&&op!=='/')return v;this.position++;const r=this.parseUnary();if(op==='/'&&r===0)throw new BreakdownCalculationError(`División por cero en "${this.source}".`);v=op==='*'?v*r:v/r;}}
  private parseUnary():number{this.skip();const c=this.source[this.position];if(c==='+'||c==='-'){this.position++;const v=this.parseUnary();return c==='-'?-v:v;}return this.parsePrimary();}
  private parsePrimary():number{
    this.skip();
    if(this.source[this.position]==='('){this.position++;const v=this.parseAdditive();this.skip();if(this.source[this.position]!==')')throw new BreakdownCalculationError(`Falta ')' en "${this.source}".`);this.position++;return v;}
    const n=this.readNumber();if(n!==null)return n;
    const id=this.readIdentifier();if(!id)throw new BreakdownCalculationError(`Token no reconocido en "${this.source}".`);this.skip();
    if(this.source[this.position]!=='('){const v=this.variables[id];if(v==null||!Number.isFinite(v))throw new BreakdownCalculationError(`Variable "${id}" no definida.`);return v;}
    this.position++;const args:number[]=[];this.skip();if(this.source[this.position]!==')'){while(true){args.push(this.parseAdditive());this.skip();if(this.source[this.position]!==',')break;this.position++;}}
    this.skip();if(this.source[this.position]!==')')throw new BreakdownCalculationError(`Falta ')' en "${this.source}".`);this.position++;return this.call(id,args);
  }
  private call(name:string,args:number[]):number{const fn=name.toUpperCase();if(fn==='MIN')return Math.min(...args);if(fn==='MAX')return Math.max(...args);if(fn==='ROUND')return round(args[0]??0,Math.trunc(args[1]??0),'HALF_UP');if(fn==='ROUNDUP')return round(args[0]??0,Math.trunc(args[1]??0),'UP');if(fn==='ROUNDDOWN')return round(args[0]??0,Math.trunc(args[1]??0),'DOWN');throw new BreakdownCalculationError(`Función "${name}" no soportada.`);}
  private readNumber():number|null{this.skip();const m=this.source.slice(this.position).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);if(!m)return null;this.position+=m[0].length;return Number(m[0]);}
  private readIdentifier():string|null{this.skip();const m=this.source.slice(this.position).match(/^[A-Za-z_][A-Za-z0-9_]*/);if(!m)return null;this.position+=m[0].length;return m[0];}
  private skip(){while(/\s/.test(this.source[this.position]??''))this.position++;}
}

function clampDecimals(v:number){return Math.min(6,Math.max(0,Math.trunc(v)));}
function round(value:number,decimals:number,mode:BreakdownRoundingMode){const factor=10**clampDecimals(decimals);if(!Number.isFinite(value))return value;if(mode==='UP')return Math.ceil(value*factor-Number.EPSILON)/factor;if(mode==='DOWN')return Math.floor(value*factor+Number.EPSILON)/factor;const scaled=value*factor;return(scaled>=0?Math.floor(scaled+0.5):Math.ceil(scaled-0.5))/factor;}
