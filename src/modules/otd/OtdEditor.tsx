import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Save, Search, Trash2, WandSparkles, X } from 'lucide-react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import './otd.css';

type Otd = { id:number; company_id:number; code:string; name:string; template_type:string|null; active:boolean };
type Selection = { id:number; code:string; name:string; selection_type:string; required:boolean; sort_order:number; options?: Option[] };
type Option = { id:number; code:string; label:string; value:string|null; sort_order:number };
type Variable = { id:number; code:string; name:string; expression:string|null; data_type:string; min_value:number|null; max_value:number|null; sort_order:number; active:boolean };
type Product = { id:number; code:string; technical_description:string|null; commercial_description:string|null; measurement_type_id:number|null; measurement_type?: { id:number; code:string; name:string; dimension_count:number }|null };
type Component = { id:number; product_id:number|null; code:string; description:string|null; quantity_expression:string|null; component_type:'BASIC'|'IMPROVEMENT'; price_increment:number; active:boolean; sort_order:number };

const emptySelection = (): Selection => ({ id:0, code:'', name:'', selection_type:'OPTION', required:false, sort_order:0, options:[] });
const emptyVariable = (): Variable => ({ id:0, code:'', name:'', expression:'', data_type:'NUMBER', min_value:null, max_value:null, sort_order:0, active:true });
const emptyComponent = (): Component => ({ id:0, product_id:null, code:'', description:'', quantity_expression:'1', component_type:'BASIC', price_increment:0, active:true, sort_order:0 });

export function OtdEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [otd, setOtd] = useState<Otd>({ id:0, company_id:0, code:'', name:'', template_type:'TOLDO', active:true });
  const [selections, setSelections] = useState<Selection[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [products, setProducts] = useState<Record<number,Product>>({});
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [activeProductComponent, setActiveProductComponent] = useState<number|null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [naturalRule, setNaturalRule] = useState('');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!editing || !supabase) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const oid = Number(id);
      const [o,s,v,c] = await Promise.all([
        supabase.from('otd').select('*').eq('id', oid).single(),
        supabase.from('otd_selection').select('*, otd_selection_option(*)').eq('otd_id', oid).order('sort_order'),
        supabase.from('otd_variable').select('*').eq('otd_id', oid).order('sort_order'),
        supabase.from('otd_component').select('*').eq('otd_id', oid).order('sort_order'),
      ]);
      if (cancelled) return;
      if (o.data) setOtd(o.data);
      if (s.data) setSelections(s.data.map((x:any) => ({ ...x, options:x.otd_selection_option ?? [] })));
      if (v.data) setVariables(v.data);
      if (c.data) {
        const loaded = (c.data as any[]).map(x => ({ ...x, product_id:x.product_id ?? null, component_type:x.component_type === 'IMPROVEMENT' ? 'IMPROVEMENT' : 'BASIC', price_increment:Number(x.price_increment ?? 0), quantity_expression:x.quantity_expression || '1' })) as Component[];
        setComponents(loaded);
        await loadProducts(loaded.map(x=>x.product_id).filter((x): x is number => Number.isFinite(x)));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, editing]);

  const variableCodes = useMemo(() => variables.filter(v=>v.code).map(v=>v.code).join(', '), [variables]);

  async function loadProducts(ids:number[]) {
    if (!supabase || !ids.length) return;
    const unique = [...new Set(ids)];
    const { data, error } = await supabase.from('product').select('id,code,technical_description,commercial_description,measurement_type_id').in('id', unique);
    if (error || !data) return;
    const mtIds = [...new Set(data.map((p:any)=>p.measurement_type_id).filter((x:any): x is number => Number.isFinite(x)))];
    const measurements = mtIds.length ? (await supabase.from('measurement_type').select('id,code,name,dimension_count').in('id', mtIds)).data ?? [] : [];
    const mtMap = Object.fromEntries(measurements.map((m:any)=>[m.id,m]));
    setProducts(prev => ({ ...prev, ...Object.fromEntries(data.map((p:any)=>[p.id,{...p,measurement_type:mtMap[p.measurement_type_id] ?? null}])) }));
  }

  async function searchProducts(term:string) {
    setProductSearch(term);
    if (!supabase || term.trim().length < 2) { setProductResults([]); return; }
    const q = term.trim();
    const { data, error } = await supabase.from('product').select('id,code,technical_description,commercial_description,measurement_type_id').eq('active',true).or(`code.ilike.%${q}%,technical_description.ilike.%${q}%,commercial_description.ilike.%${q}%`).order('code').limit(8);
    if (error || !data) { setProductResults([]); return; }
    const mtIds = [...new Set(data.map((p:any)=>p.measurement_type_id).filter((x:any): x is number => Number.isFinite(x)))];
    const measurements = mtIds.length ? (await supabase.from('measurement_type').select('id,code,name,dimension_count').in('id', mtIds)).data ?? [] : [];
    const mtMap = Object.fromEntries(measurements.map((m:any)=>[m.id,m]));
    setProductResults(data.map((p:any)=>({...p,measurement_type:mtMap[p.measurement_type_id] ?? null})) as Product[]);
  }

  function selectProduct(index:number, product:Product) {
    const next = [...components];
    next[index] = { ...next[index], product_id:product.id, code:product.code, description:product.commercial_description || product.technical_description || product.code };
    setComponents(next);
    setProducts(prev=>({...prev,[product.id]:product}));
    setActiveProductComponent(null);
    setProductSearch('');
    setProductResults([]);
  }

  function clearProduct(index:number) {
    const next = [...components];
    next[index] = { ...next[index], product_id:null, code:'', description:'' };
    setComponents(next);
  }

  async function companyId() {
    if (!supabase) throw new Error('Supabase no está configurado');
    const { data:{ user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sesión no disponible');
    const { data, error } = await supabase.from('user_account').select('company_id').eq('auth_user_id', user.id).single();
    if (error || !data) throw new Error('No se ha podido determinar la empresa del usuario');
    return Number(data.company_id);
  }

  async function save(e?:FormEvent) {
    e?.preventDefault();
    if (!supabase) return setMessage('Supabase no está configurado.');
    if (!otd.code.trim() || !otd.name.trim()) return setMessage('Código y nombre son obligatorios.');
    const invalid = components.findIndex(c=>!c.product_id);
    if (invalid >= 0) return setMessage(`El componente ${invalid + 1} debe tener un artículo de ONIN seleccionado.`);
    setSaving(true); setMessage('');
    try {
      const company_id = otd.company_id || await companyId();
      let oid = otd.id;
      if (!oid) {
        const { data, error } = await supabase.from('otd').insert({ company_id, code:otd.code.trim(), name:otd.name.trim(), template_type:otd.template_type || null, active:otd.active }).select().single();
        if (error) throw error;
        oid = data.id;
      } else {
        const { error } = await supabase.from('otd').update({ code:otd.code.trim(), name:otd.name.trim(), template_type:otd.template_type || null, active:otd.active, updated_at:new Date().toISOString() }).eq('id', oid);
        if (error) throw error;
      }
      await supabase.from('otd_selection').delete().eq('otd_id', oid);
      await supabase.from('otd_variable').delete().eq('otd_id', oid);
      await supabase.from('otd_component').delete().eq('otd_id', oid);
      for (const [si,s] of selections.entries()) {
        const { data: sd, error: se } = await supabase.from('otd_selection').insert({ otd_id:oid, code:s.code, name:s.name, selection_type:s.selection_type, required:s.required, sort_order:si }).select().single();
        if (se) throw se;
        const opts = (s.options ?? []).map((o,i)=>({ selection_id:sd.id, code:o.code, label:o.label, value:o.value ?? null, sort_order:i }));
        if (opts.length) { const { error } = await supabase.from('otd_selection_option').insert(opts); if (error) throw error; }
      }
      const vars = variables.map((v,i)=>({ otd_id:oid, code:v.code, name:v.name, expression:v.expression || null, data_type:v.data_type, min_value:v.min_value, max_value:v.max_value, sort_order:i, active:v.active }));
      if (vars.length) { const { error } = await supabase.from('otd_variable').insert(vars); if (error) throw error; }
      const comps = components.map((c,i)=>({ otd_id:oid, product_id:c.product_id, code:c.code, description:c.description || null, quantity_expression:c.quantity_expression || '1', component_type:c.component_type, price_increment:c.component_type === 'IMPROVEMENT' ? Number(c.price_increment || 0) : 0, active:c.active, sort_order:i }));
      if (comps.length) { const { error } = await supabase.from('otd_component').insert(comps); if (error) throw error; }
      const { data: allS } = await supabase.from('otd_selection').select('*, otd_selection_option(*)').eq('otd_id', oid).order('sort_order');
      const { data: allV } = await supabase.from('otd_variable').select('*').eq('otd_id', oid).order('sort_order');
      const { data: allC } = await supabase.from('otd_component').select('*').eq('otd_id', oid).order('sort_order');
      const nextVersion = ((await supabase.from('otd_version').select('version_number').eq('otd_id',oid).order('version_number',{ascending:false}).limit(1).maybeSingle()).data?.version_number ?? 0) + 1;
      const snapshot = { otd:{...otd,id:oid,company_id}, selections:allS ?? [], variables:allV ?? [], components:allC ?? [], natural_rule:naturalRule };
      const { error: ve } = await supabase.from('otd_version').insert({ otd_id:oid, version_number:nextVersion, snapshot });
      if (ve) throw ve;
      setOtd(x=>({...x,id:oid,company_id}));
      setMessage(`Guardado correctamente. Versión ${nextVersion}.`);
      if (!editing) navigate(`/produccion/otd/${oid}`, { replace:true });
    } catch (err:any) { setMessage(err?.message ?? 'No se ha podido guardar.'); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="otd-page"><div className="otd-empty">Cargando OTD…</div></div>;

  return <div className="otd-page">
    <div className="otd-head">
      <div><NavLink to="/produccion/otd" className="otd-back"><ArrowLeft size={15}/> OTD</NavLink><div className="eyebrow">EDITOR TÉCNICO</div><h1>{editing ? otd.name || 'Editar OTD' : 'Nuevo OTD'}</h1><p>Construye el producto a partir de artículos reales de ONIN.</p></div>
      <button className="primary-btn" onClick={()=>save()} disabled={saving}><Save size={16}/>{saving?'Guardando…':'Guardar OTD'}</button>
    </div>
    <form onSubmit={save}>
      <section className="otd-card">
        <div className="otd-card-head"><div><h2>Identificación</h2><p>Definición del artículo compuesto.</p></div></div>
        <div className="otd-grid three"><label>Código<input value={otd.code} onChange={e=>setOtd({...otd,code:e.target.value})}/></label><label>Nombre<input value={otd.name} onChange={e=>setOtd({...otd,name:e.target.value})}/></label><label>Tipo<select value={otd.template_type ?? ''} onChange={e=>setOtd({...otd,template_type:e.target.value})}><option value="TOLDO">Toldo</option><option value="">Genérico</option></select></label></div>
      </section>
      <section className="otd-card">
        <div className="otd-card-head"><div><h2>Entradas para oficina</h2><p>Lo que el usuario de oficina seleccionará al añadir el artículo al presupuesto.</p></div><button type="button" className="secondary-btn" onClick={()=>setSelections(x=>[...x,emptySelection()])}><Plus size={15}/> Añadir entrada</button></div>
        {selections.length===0 ? <div className="otd-empty">Todavía no hay entradas. Añade medidas, colores, opciones o cualquier dato que deba introducir oficina.</div> : selections.map((s,si)=><div className="otd-row-card" key={si}><div className="otd-row-actions"><strong>{si+1}. Entrada</strong><button type="button" className="icon-btn danger" onClick={()=>setSelections(x=>x.filter((_,i)=>i!==si))}><Trash2 size={15}/></button></div><div className="otd-grid four"><label>Código<input value={s.code} onChange={e=>{const x=[...selections];x[si]={...s,code:e.target.value};setSelections(x)}}/></label><label>Nombre<input value={s.name} onChange={e=>{const x=[...selections];x[si]={...s,name:e.target.value};setSelections(x)}}/></label><label>Tipo<select value={s.selection_type} onChange={e=>{const x=[...selections];x[si]={...s,selection_type:e.target.value};setSelections(x)}}><option>OPTION</option><option>NUMBER</option><option>TEXT</option></select></label><label className="check"><input type="checkbox" checked={s.required} onChange={e=>{const x=[...selections];x[si]={...s,required:e.target.checked};setSelections(x)}}/> Obligatorio</label></div>{s.selection_type==='OPTION'&&<div className="option-list">{(s.options??[]).map((o,oi)=><div className="option-line" key={oi}><input placeholder="Código" value={o.code} onChange={e=>{const x=[...selections];const opts=[...(s.options??[])];opts[oi]={...o,code:e.target.value};x[si]={...s,options:opts};setSelections(x)}}/><input placeholder="Etiqueta" value={o.label} onChange={e=>{const x=[...selections];const opts=[...(s.options??[])];opts[oi]={...o,label:e.target.value};x[si]={...s,options:opts};setSelections(x)}}/><input placeholder="Valor" value={o.value??''} onChange={e=>{const x=[...selections];const opts=[...(s.options??[])];opts[oi]={...o,value:e.target.value};x[si]={...s,options:opts};setSelections(x)}}/><button type="button" className="icon-btn danger" onClick={()=>{const x=[...selections];x[si]={...s,options:(s.options??[]).filter((_,i)=>i!==oi)};setSelections(x)}}><Trash2 size={14}/></button></div>)}<button type="button" className="link-btn" onClick={()=>{const x=[...selections];x[si]={...s,options:[...(s.options??[]),{id:0,code:'',label:'',value:'',sort_order:(s.options??[]).length}]};setSelections(x)}}><Plus size={13}/> Añadir opción</button></div>}</div>)}
      </section>
      <section className="otd-card">
        <div className="otd-card-head"><div><h2>Formulación</h2><p>El técnico define la lógica; oficina no necesita conocerla.</p></div><span className="ai-badge"><WandSparkles size={14}/> IA preparada</span></div>
        <label>Regla en lenguaje natural<textarea value={naturalRule} onChange={e=>setNaturalRule(e.target.value)} placeholder="Ejemplo: si el ancho supera 4 metros, añadir un soporte central; la cantidad de lona es ancho por salida."/></label>
        <div className="hint">Variables disponibles: {variableCodes || 'todavía no definidas'}. En esta primera versión el texto se guarda como especificación; no se ejecuta automáticamente.</div>
        {variables.map((v,vi)=><div className="otd-rule-line" key={vi}><input placeholder="Código" value={v.code} onChange={e=>{const x=[...variables];x[vi]={...v,code:e.target.value};setVariables(x)}}/><input placeholder="Nombre" value={v.name} onChange={e=>{const x=[...variables];x[vi]={...v,name:e.target.value};setVariables(x)}}/><input className="wide" placeholder="Expresión técnica (opcional)" value={v.expression??''} onChange={e=>{const x=[...variables];x[vi]={...v,expression:e.target.value};setVariables(x)}}/><button type="button" className="icon-btn danger" onClick={()=>setVariables(x=>x.filter((_,i)=>i!==vi))}><Trash2 size={14}/></button></div>)}
        <button type="button" className="secondary-btn" onClick={()=>setVariables(x=>[...x,emptyVariable()])}><Plus size={15}/> Añadir variable calculada</button>
      </section>
      <section className="otd-card">
        <div className="otd-card-head"><div><h2>Componentes del producto</h2><p>Cada componente es un artículo real de ONIN. El OTD solo define cómo participa en el producto.</p></div><button type="button" className="secondary-btn" onClick={()=>setComponents(x=>[...x,emptyComponent()])}><Plus size={15}/> Añadir artículo</button></div>
        {components.length===0 ? <div className="otd-empty">Todavía no hay artículos en el OTD.</div> : components.map((c,ci)=>{
          const product = c.product_id ? products[c.product_id] : undefined;
          return <div className="otd-row-card" key={c.id || ci}>
            <div className="otd-row-actions"><strong>{ci+1}. Componente</strong><button type="button" className="icon-btn danger" onClick={()=>setComponents(x=>x.filter((_,i)=>i!==ci))}><Trash2 size={15}/></button></div>
            <div className="otd-component-grid">
              <div className="otd-product-field">
                <span className="field-label">Artículo</span>
                {product ? <div className="otd-product-selected"><div><strong>{product.code}</strong><span>{product.commercial_description || product.technical_description || 'Sin descripción'}</span>{product.measurement_type && <small>Tipo de medida: {product.measurement_type.name} · {product.measurement_type.dimension_count} dimensión(es)</small>}</div><button type="button" className="icon-btn" title="Cambiar artículo" onClick={()=>{setActiveProductComponent(ci);setProductSearch(product.code);void searchProducts(product.code)}}><Search size={15}/></button><button type="button" className="icon-btn danger" title="Quitar artículo" onClick={()=>clearProduct(ci)}><X size={15}/></button></div> : <button type="button" className="product-select-empty" onClick={()=>{setActiveProductComponent(ci);setProductSearch('');setProductResults([])}}><Search size={16}/> Seleccionar artículo de ONIN</button>}
                {activeProductComponent===ci && <div className="otd-product-picker"><div className="otd-product-search"><Search size={15}/><input autoFocus value={productSearch} onChange={e=>void searchProducts(e.target.value)} placeholder="Buscar por código o descripción…"/><button type="button" className="icon-btn" onClick={()=>{setActiveProductComponent(null);setProductResults([])}}><X size={14}/></button></div>{productResults.length>0 ? <div className="otd-product-results">{productResults.map(p=><button type="button" key={p.id} onClick={()=>selectProduct(ci,p)}><strong>{p.code}</strong><span>{p.commercial_description || p.technical_description || 'Sin descripción'}</span>{p.measurement_type && <small>{p.measurement_type.name} · {p.measurement_type.dimension_count} dimensión(es)</small>}</button>)}</div> : productSearch.length>=2 ? <div className="otd-product-no-results">No se han encontrado artículos.</div> : <div className="otd-product-no-results">Escribe al menos 2 caracteres.</div>}</div>}
              </div>
              <label>Tipo<select value={c.component_type} onChange={e=>{const x=[...components];x[ci]={...c,component_type:e.target.value as Component['component_type']};setComponents(x)}}><option value="BASIC">Básico</option><option value="IMPROVEMENT">Mejora</option></select></label>
              <label>Cantidad / fórmula<input value={c.quantity_expression??''} onChange={e=>{const x=[...components];x[ci]={...c,quantity_expression:e.target.value};setComponents(x)}} placeholder="Ej. 1"/></label>
              <label>Incremento {c.component_type==='IMPROVEMENT' && <span className="required-mark">*</span>}<input type="number" min="0" step="0.01" value={c.component_type==='IMPROVEMENT'?c.price_increment:0} disabled={c.component_type!=='IMPROVEMENT'} onChange={e=>{const x=[...components];x[ci]={...c,price_increment:Number(e.target.value)||0};setComponents(x)}} placeholder="0,00"/></label>
            </div>
          </div>;
        })}
      </section>
      {message && <div className={`otd-message ${message.startsWith('Guardado')?'ok':'error'}`}>{message}</div>}
    </form>
  </div>;
}

export function OtdList() {
  const [rows,setRows]=useState<Otd[]>([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{ if(!supabase) return; void supabase.from('otd').select('*').order('name').then(({data})=>{setRows(data??[]);setLoading(false);}); },[]);
  return <div className="otd-page"><div className="otd-head"><div><div className="eyebrow">PRODUCCIÓN</div><h1>OTD</h1><p>Configuradores técnicos de artículos compuestos.</p></div><NavLink to="/produccion/otd/nuevo" className="primary-btn"><Plus size={16}/> Nuevo OTD</NavLink></div><div className="otd-card">{loading?<div className="otd-empty">Cargando…</div>:rows.length===0?<div className="otd-empty">No hay OTD creados todavía. Crea el primero desde el editor técnico.</div>:rows.map(r=><NavLink className="otd-list-row" key={r.id} to={`/produccion/otd/${r.id}`}><span><strong>{r.code}</strong><small>{r.name}</small></span><span className={r.active?'active-dot':'inactive-dot'}>{r.active?'Activo':'Inactivo'}</span></NavLink>)}</div></div>;
}
