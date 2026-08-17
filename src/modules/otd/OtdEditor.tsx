import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, Save, Trash2, ArrowLeft, WandSparkles } from 'lucide-react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import './otd.css';

type Otd = { id:number; company_id:number; code:string; name:string; template_type:string|null; active:boolean };
type Selection = { id:number; code:string; name:string; selection_type:string; required:boolean; sort_order:number; options?: Option[] };
type Option = { id:number; code:string; label:string; value:string|null; sort_order:number };
type Variable = { id:number; code:string; name:string; expression:string|null; data_type:string; min_value:number|null; max_value:number|null; sort_order:number; active:boolean };
type Component = { id:number; code:string; description:string|null; quantity_expression:string|null; active:boolean; sort_order:number };

const emptySelection = (): Selection => ({ id:0, code:'', name:'', selection_type:'OPTION', required:false, sort_order:0, options:[] });
const emptyVariable = (): Variable => ({ id:0, code:'', name:'', expression:'', data_type:'NUMBER', min_value:null, max_value:null, sort_order:0, active:true });
const emptyComponent = (): Component => ({ id:0, code:'', description:'', quantity_expression:'', active:true, sort_order:0 });

export function OtdEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [otd, setOtd] = useState<Otd>({ id:0, company_id:0, code:'', name:'', template_type:'TOLDO', active:true });
  const [selections, setSelections] = useState<Selection[]>([]);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
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
      if (c.data) setComponents(c.data);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, editing]);

  const variableCodes = useMemo(() => variables.filter(v=>v.code).map(v=>v.code).join(', '), [variables]);

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
      const comps = components.map((c,i)=>({ otd_id:oid, code:c.code, description:c.description || null, quantity_expression:c.quantity_expression || null, active:c.active, sort_order:i }));
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
      <div><NavLink to="/produccion/otd" className="otd-back"><ArrowLeft size={15}/> OTD</NavLink><div className="eyebrow">EDITOR TÉCNICO</div><h1>{editing ? otd.name || 'Editar OTD' : 'Nuevo OTD'}</h1><p>Define entradas de oficina, variables de cálculo y componentes. La formulación puede evolucionar a lenguaje natural asistido.</p></div>
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
        <div className="otd-card-head"><div><h2>Componentes y materiales</h2><p>Resultado que utilizará posteriormente el presupuesto/producción.</p></div><button type="button" className="secondary-btn" onClick={()=>setComponents(x=>[...x,emptyComponent()])}><Plus size={15}/> Añadir componente</button></div>
        {components.length===0 ? <div className="otd-empty">Sin componentes definidos.</div> : components.map((c,ci)=><div className="otd-rule-line" key={ci}><input placeholder="Código" value={c.code} onChange={e=>{const x=[...components];x[ci]={...c,code:e.target.value};setComponents(x)}}/><input placeholder="Descripción" value={c.description??''} onChange={e=>{const x=[...components];x[ci]={...c,description:e.target.value};setComponents(x)}}/><input className="wide" placeholder="Cantidad / expresión" value={c.quantity_expression??''} onChange={e=>{const x=[...components];x[ci]={...c,quantity_expression:e.target.value};setComponents(x)}}/><button type="button" className="icon-btn danger" onClick={()=>setComponents(x=>x.filter((_,i)=>i!==ci))}><Trash2 size={14}/></button></div>)}
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
