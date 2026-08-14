import { useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, RotateCcw, Save, Search, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { getActiveCompanies } from '../../services/core/coreRepository';
import { listCatalog, listAttributeValues, removeAttributeValue, upsertAttributeValue, upsertCatalog, type AttributeValue, type CatalogKind, type CatalogRow } from '../../services/catalog/catalogRepository';
import './catalog.css';

type CatalogConfig={key:CatalogKind;label:string;description:string;singular:string};
const CONFIGS:CatalogConfig[]=[
 {key:'families',label:'Familias',singular:'Familia',description:'Agrupación comercial de artículos.'},
 {key:'types',label:'Tipos de producto',singular:'Tipo de producto',description:'Clasificación funcional del artículo.'},
 {key:'units',label:'Unidades de medida',singular:'Unidad',description:'Unidad base utilizada por los artículos.'},
 {key:'magnitudes',label:'Magnitudes',singular:'Magnitud',description:'Magnitudes o dimensiones funcionales.'},
 {key:'colors',label:'Colores',singular:'Color',description:'Catálogo de colores reutilizable por artículos.'},
 {key:'attributes',label:'Características',singular:'Característica',description:'Características parametrizables y sus valores.'},
];

const emptyForm={id:undefined as number|undefined,code:'',name:'',active:true,confectionable:false,data_type:'TEXT'};

export function ProductCatalogV1(){
 const [companyId,setCompanyId]=useState<number|null>(null);
 const [kind,setKind]=useState<CatalogKind>('families');
 const [rows,setRows]=useState<CatalogRow[]>([]);
 const [search,setSearch]=useState('');
 const [form,setForm]=useState(emptyForm);
 const [editing,setEditing]=useState(false);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [selectedAttribute,setSelectedAttribute]=useState<CatalogRow|null>(null);
 const [attributeValues,setAttributeValues]=useState<AttributeValue[]>([]);
 const [valueForm,setValueForm]=useState({id:undefined as number|undefined,code:'',name:'',active:true,sort_order:0});
 const current=useMemo(()=>CONFIGS.find(c=>c.key===kind)!,[kind]);

 useEffect(()=>{getActiveCompanies().then(cs=>setCompanyId(cs[0]?.id??null)).catch(e=>setError(e instanceof Error?e.message:'No se pudo obtener la empresa activa.'));},[]);
 useEffect(()=>{if(companyId) load();},[companyId,kind]);

 async function load(){ if(!companyId)return; setLoading(true); setError(''); try{setRows(await listCatalog(kind,companyId,search)); if(kind!=='attributes'){setSelectedAttribute(null);setAttributeValues([]);}}catch(e){setError(e instanceof Error?e.message:'No se pudo cargar el catálogo.');}finally{setLoading(false);} }
 function startNew(){setForm({...emptyForm});setEditing(true);setError('');}
 function startEdit(r:CatalogRow){setForm({id:r.id,code:r.code,name:r.name,active:r.active,confectionable:!!r.confectionable,data_type:r.data_type??'TEXT'});setEditing(true);setError('');}
 async function save(){if(!companyId)return; if(!form.code.trim()||!form.name.trim()){setError('Código y nombre son obligatorios.');return;} setSaving(true);setError('');try{await upsertCatalog(kind,companyId,form);setEditing(false);await load();}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{setSaving(false);}}
 async function selectAttribute(r:CatalogRow){setSelectedAttribute(r);setValueForm({id:undefined,code:'',name:'',active:true,sort_order:0});try{setAttributeValues(await listAttributeValues(r.id));setError('');}catch(e){setError(e instanceof Error?e.message:'No se pudieron cargar los valores.');}}
 async function saveValue(){if(!selectedAttribute)return;if(!valueForm.code.trim()||!valueForm.name.trim()){setError('Código y nombre del valor son obligatorios.');return;}setSaving(true);setError('');try{await upsertAttributeValue({...valueForm,attribute_id:selectedAttribute.id});setValueForm({id:undefined,code:'',name:'',active:true,sort_order:0});setAttributeValues(await listAttributeValues(selectedAttribute.id));}catch(e){setError(e instanceof Error?e.message:'No se pudo guardar el valor.');}finally{setSaving(false);}}
 async function deleteValue(id:number){if(!window.confirm('¿Eliminar este valor de característica?'))return;try{await removeAttributeValue(id);if(selectedAttribute)setAttributeValues(await listAttributeValues(selectedAttribute.id));}catch(e){setError(e instanceof Error?e.message:'No se pudo eliminar el valor.');}}

 return <div className="module-page catalog-page">
   <div className="page-head"><div><div className="eyebrow">VENTAS / ARTÍCULOS / CATÁLOGOS</div><h1>Catálogos de Artículos</h1><p>Base maestra para construir el módulo de Artículos sin duplicar reglas de catálogo.</p></div><button className="primary-button" onClick={startNew}><Plus size={16}/> Nuevo {current.singular}</button></div>
   {error&&<div className="inline-error">{error}</div>}
   <div className="catalog-tabs">{CONFIGS.map(c=><button key={c.key} className={kind===c.key?'catalog-tab active':'catalog-tab'} onClick={()=>{setKind(c.key);setEditing(false);setSearch('');}}>{c.label}</button>)}</div>
   <div className="catalog-layout">
     <section className="panel"><div className="panel-head"><div><h2>{current.label}</h2><p>{current.description}{kind==='attributes'?' Los valores se gestionan a la derecha.':''}</p></div></div><div className="catalog-toolbar"><div className="search-box"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()} placeholder={`Buscar ${current.label.toLowerCase()}...`}/></div><button className="secondary-button" onClick={load}><RotateCcw size={15}/> Actualizar</button></div>
     {loading?<div className="loading-block">Cargando...</div>:<div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>Código</th><th>Nombre</th>{kind==='families'&&<th>Confeccionable</th>}{kind==='attributes'&&<th>Tipo</th>}<th>Estado</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className={selectedAttribute?.id===r.id?'selected-row':''}><td>{r.code}</td><td>{r.name}</td>{kind==='families'&&<td>{r.confectionable?'Sí':'No'}</td>}{kind==='attributes'&&<td>{r.data_type??'TEXT'}</td>}<td><span className={`status ${r.active?'active':'inactive'}`}>{r.active?'Activo':'Inactivo'}</span></td><td><div className="item-actions"><button className="icon-action" title="Editar" onClick={()=>startEdit(r)}><Edit3 size={15}/></button>{kind==='attributes'&&<button className="secondary-button compact" onClick={()=>selectAttribute(r)}>Valores</button>}</div></td></tr>)}{rows.length===0&&<tr><td colSpan={6}><div className="empty-state">No hay registros para este catálogo.</div></td></tr>}</tbody></table></div>}
     </section>
     {editing&&<aside className="panel catalog-editor"><div className="panel-head"><div><h2>{form.id?'Editar':'Nuevo'} {current.singular}</h2><p>Los campos no editables deben conservar el sombreado global.</p></div><button className="icon-action" onClick={()=>setEditing(false)} title="Cancelar"><X size={17}/></button></div><div className="form-grid"><label>Código *<input value={form.code} onChange={e=>setForm({...form,code:e.target.value})} /></label><label>Nombre *<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} /></label>{kind==='families'&&<label className="wide inline-check"><input type="checkbox" checked={form.confectionable} onChange={e=>setForm({...form,confectionable:e.target.checked})}/><span>Confeccionable</span></label>}{kind==='attributes'&&<label>Tipo de dato<select value={form.data_type} onChange={e=>setForm({...form,data_type:e.target.value})}><option value="TEXT">Texto</option><option value="NUMBER">Número</option><option value="BOOLEAN">Booleano</option><option value="OPTION">Opción</option></select></label>}<label>Estado<select value={form.active?'1':'0'} onChange={e=>setForm({...form,active:e.target.value==='1'})}><option value="1">Activo</option><option value="0">Inactivo</option></select></label></div><div className="actions"><button className="secondary-button" onClick={()=>setEditing(false)}>Cancelar</button><button className="primary-button" disabled={saving} onClick={save}><Save size={15}/>{saving?'Guardando…':'Guardar'}</button></div></aside>}
     {kind==='attributes'&&selectedAttribute&&<aside className="panel catalog-editor"><div className="panel-head"><div><h2>Valores de {selectedAttribute.name}</h2><p>Gestiona los valores reutilizables de esta característica.</p></div></div><div className="form-grid"><label>Código *<input value={valueForm.code} onChange={e=>setValueForm({...valueForm,code:e.target.value})}/></label><label>Nombre *<input value={valueForm.name} onChange={e=>setValueForm({...valueForm,name:e.target.value})}/></label><label>Orden<input type="number" value={valueForm.sort_order} onChange={e=>setValueForm({...valueForm,sort_order:Number(e.target.value)})}/></label><label>Estado<select value={valueForm.active?'1':'0'} onChange={e=>setValueForm({...valueForm,active:e.target.value==='1'})}><option value="1">Activo</option><option value="0">Inactivo</option></select></label></div><div className="actions"><button className="primary-button" disabled={saving} onClick={saveValue}><Plus size={15}/>{saving?'Guardando…':'Añadir valor'}</button></div><div className="nested-list catalog-values">{attributeValues.map(v=><div className="nested-item" key={v.id}><div><strong>{v.code}</strong><span>{v.name} · {v.active?'Activo':'Inactivo'}</span></div><button className="icon-action danger" onClick={()=>deleteValue(v.id)} title="Eliminar"><ToggleLeft size={15}/></button></div>)}{attributeValues.length===0&&<div className="empty-substate">Sin valores definidos.</div>}</div></aside>}
   </div>
 </div>;
}
