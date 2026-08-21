import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Calculator, CheckCircle2, Ruler } from 'lucide-react';
import { NavLink, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { evaluateOtdComponent, resolveOtdVariables, type FormulaEvaluationContext, type OtdComponentFormula, type OtdVariableDefinition } from '../../services/otd/formulaEngine';
import './otd-runtime.css';

type Otd = { id:number; code:string; name:string; template_type:string|null; active:boolean; product_id:number|null };
type Selection = { id:number; code:string; name:string; selection_type:string; required:boolean; sort_order:number; options:{id:number;code:string;label:string;value:string|null;sort_order:number}[] };
type Variable = OtdVariableDefinition & { id:number; name:string; min_value:number|null; max_value:number|null; sort_order:number };
type Product = { id:number; code:string; commercial_description:string|null; technical_description:string|null; sales_price:number|null; base_unit_id:number|null };
type Unit = { id:number; code:string; name:string };
type Component = OtdComponentFormula & { id:number; product_id:number|null; description:string|null; component_type:string; price_increment:number; active:boolean; sort_order:number; unit_id:number|null; dimension_expressions:Record<string,string>; product?:Product|null };
type EvaluatedRow = Component & { ok:boolean; quantity:number; dimensions:Record<string,number>; unit:Unit|undefined; unitPrice:number; total:number; formulaError?:string };

export function OtdRuntime() {
  const { id } = useParams();
  const [otd,setOtd] = useState<Otd|null>(null);
  const [selections,setSelections] = useState<Selection[]>([]);
  const [variables,setVariables] = useState<Variable[]>([]);
  const [components,setComponents] = useState<Component[]>([]);
  const [units,setUnits] = useState<Record<number,Unit>>({});
  const [values,setValues] = useState<Record<string,string>>({});
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');

  useEffect(() => {
    if (!supabase || !id) { setLoading(false); return; }
    let active = true;
    (async () => {
      try {
        const oid = Number(id);
        const [o,s,v,c] = await Promise.all([
          supabase.from('otd').select('*').eq('id',oid).single(),
          supabase.from('otd_selection').select('*,otd_selection_option(*)').eq('otd_id',oid).order('sort_order'),
          supabase.from('otd_variable').select('*').eq('otd_id',oid).eq('active',true).order('sort_order'),
          supabase.from('otd_component').select('*').eq('otd_id',oid).eq('active',true).order('sort_order'),
        ]);
        if (o.error) throw o.error;
        const componentRows = (c.data ?? []) as any[];
        const productIds = [...new Set(componentRows.map(x=>x.product_id).filter((x:any)=>Number.isFinite(x)))];
        const unitIds = [...new Set(componentRows.map(x=>x.unit_id).filter((x:any)=>Number.isFinite(x)))];
        const [productsRes,unitsRes] = await Promise.all([
          productIds.length ? supabase.from('product').select('id,code,commercial_description,technical_description,sales_price,base_unit_id').in('id',productIds) : Promise.resolve({data:[] as any[],error:null}),
          unitIds.length ? supabase.from('unit').select('id,code,name').in('id',unitIds) : Promise.resolve({data:[] as any[],error:null}),
        ]);
        if (!active) return;
        const productMap = Object.fromEntries((productsRes.data??[]).map((p:any)=>[p.id,p]));
        setOtd(o.data as Otd);
        setSelections((s.data??[]).map((x:any)=>({...x,options:x.otd_selection_option??[]})));
        setVariables((v.data??[]) as Variable[]);
        setUnits(Object.fromEntries((unitsRes.data??[]).map((u:any)=>[u.id,u])));
        setComponents(componentRows.map(x=>({...x,product:productMap[x.product_id]??null,dimension_expressions:x.dimension_expressions&&typeof x.dimension_expressions==='object'?x.dimension_expressions:{},unit_id:x.unit_id==null?null:Number(x.unit_id)})) as Component[]);
      } catch (e:any) {
        if (active) setError(e?.message ?? 'No se ha podido cargar el OTD.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [id]);

  const numericInputs = useMemo<FormulaEvaluationContext>(() => {
    const result:FormulaEvaluationContext = {};
    for (const s of selections) {
      if (s.selection_type === 'NUMBER') {
        const n = Number(values[s.code]);
        if (Number.isFinite(n)) result[s.code] = n;
      }
    }
    return result;
  }, [selections,values]);

  const resolved = useMemo(() => {
    try { return resolveOtdVariables(variables,numericInputs); }
    catch { return numericInputs; }
  }, [variables,numericInputs]);

  const evaluation = useMemo<{rows:EvaluatedRow[];total:number}>(() => {
    const rows:EvaluatedRow[] = components.map(c => {
      try {
        const result = evaluateOtdComponent(c,resolved);
        const unit = c.unit_id ? units[c.unit_id] : c.product?.base_unit_id ? units[c.product.base_unit_id] : undefined;
        const unitPrice = Number(c.product?.sales_price ?? 0) + (c.component_type === 'IMPROVEMENT' ? Number(c.price_increment || 0) : 0);
        return {...c,ok:true,quantity:result.quantity,dimensions:result.dimensions,unit,unitPrice,total:result.quantity*unitPrice};
      } catch (e:any) {
        return {...c,ok:false,quantity:0,dimensions:{},unit:undefined,unitPrice:0,total:0,formulaError:e?.message??'Fórmula no válida'};
      }
    });
    return {rows,total:rows.reduce((sum,r)=>sum+r.total,0)};
  }, [components,resolved,units]);

  const requiredMissing = selections.some(s => s.required && !String(values[s.code] ?? '').trim());
  const canCalculate = !requiredMissing && selections.filter(s=>s.selection_type==='NUMBER').every(s => Number.isFinite(Number(values[s.code])));

  if (loading) return <div className="otd-runtime-page"><div className="otd-runtime-empty">Cargando configurador…</div></div>;
  if (error || !otd) return <div className="otd-runtime-page"><div className="otd-runtime-error">{error || 'OTD no encontrado.'}</div></div>;

  return <div className="otd-runtime-page">
    <div className="otd-runtime-head">
      <div><NavLink to={`/produccion/otd/${otd.id}`} className="otd-runtime-back"><ArrowLeft size={15}/> Editor OTD</NavLink><div className="eyebrow">CONFIGURADOR DE OFICINA</div><h1>{otd.name}</h1><p>{otd.code} · Introduce las medidas y opciones y ONIN resolverá las variables y el despiece.</p></div>
      <div className="runtime-status"><CheckCircle2 size={15}/> OTD activo</div>
    </div>

    <div className="otd-runtime-layout">
      <section className="otd-runtime-card">
        <div className="runtime-card-head"><div><h2>Configuración</h2><p>Datos que introduce oficina.</p></div><Ruler size={20}/></div>
        <div className="runtime-inputs">
          {selections.map(s => <label key={s.id}><span>{s.name}{s.required&&<b>*</b>}</span>{s.selection_type==='OPTION'?<select value={values[s.code]??''} onChange={e=>setValues(v=>({...v,[s.code]:e.target.value}))}><option value="">Seleccionar…</option>{s.options.map(o=><option key={o.id} value={o.value??o.code}>{o.label}</option>)}</select>:s.selection_type==='TEXT'?<input value={values[s.code]??''} onChange={e=>setValues(v=>({...v,[s.code]:e.target.value}))}/>:<input type="number" min="0" step="0.01" value={values[s.code]??''} onChange={e=>setValues(v=>({...v,[s.code]:e.target.value}))} placeholder="0"/>}</label>)}
        </div>
        {requiredMissing&&<div className="runtime-warning">Completa los campos obligatorios para calcular el producto.</div>}
      </section>

      <section className="otd-runtime-card">
        <div className="runtime-card-head"><div><h2>Variables calculadas</h2><p>Resueltas automáticamente por el motor OTD.</p></div><Calculator size={20}/></div>
        <div className="runtime-variable-list">{variables.length===0?<div className="runtime-muted">No hay variables calculadas.</div>:variables.map(v=><div key={v.id}><span>{v.name}<small>{v.code}</small></span><strong>{Number.isFinite(resolved[v.code])?resolved[v.code].toLocaleString('es-ES',{maximumFractionDigits:2}):'—'}</strong></div>)}</div>
      </section>
    </div>

    <section className="otd-runtime-card">
      <div className="runtime-card-head"><div><h2>Despiece calculado</h2><p>Los artículos son componentes reales del catálogo de ONIN.</p></div><span className="runtime-total">{evaluation.total.toLocaleString('es-ES',{style:'currency',currency:'EUR'})}</span></div>
      <div className="runtime-table"><div className="runtime-table-row runtime-table-header"><span>Artículo</span><span>Fórmula</span><span>Cantidad</span><span>Dimensiones</span><span>Precio</span><span>Total</span></div>{evaluation.rows.map(r=><div className="runtime-table-row" key={r.id}><span><strong>{r.product?.code||r.code}</strong><small>{r.description||r.product?.commercial_description||r.product?.technical_description||''}</small></span><span className="formula">{r.quantity_expression||'1'}</span><span>{r.ok?r.quantity.toLocaleString('es-ES',{maximumFractionDigits:2}):'—'} {r.unit?.code||''}</span><span>{r.ok&&Object.keys(r.dimensions).length?Object.entries(r.dimensions).map(([k,v])=><small key={k}>{k}: {v.toLocaleString('es-ES',{maximumFractionDigits:2})}</small>):'—'}</span><span>{r.unitPrice.toLocaleString('es-ES',{style:'currency',currency:'EUR'})}</span><span>{r.ok?r.total.toLocaleString('es-ES',{style:'currency',currency:'EUR'}):<em>{r.formulaError ?? 'Fórmula no válida'}</em>}</span></div>)}</div>
    </section>

    <div className="runtime-footer"><span>{canCalculate?'Configuración válida · cálculo actualizado en tiempo real':'Introduce todos los valores requeridos'}</span><strong>Precio componentes: {evaluation.total.toLocaleString('es-ES',{style:'currency',currency:'EUR'})}</strong></div>
  </div>;
}
