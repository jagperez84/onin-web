import { useEffect, useState } from 'react';
import { ArrowLeft, Edit3, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getProduct, listProductCharacteristics, createProductCharacteristic, updateProductCharacteristic, markProductCharacteristicForDeletion, restoreProductCharacteristic, type Product, type ProductCharacteristic, type ProductStatus } from '../../services/catalog/productRepository';
import { getActiveCompanies } from '../../services/core/coreRepository';
import './product.css';

const emptyForm={code:'',description:'',upc:null as number|null,ptc:null as number|null,pvp:null as number|null,price_increment:0,stock_minimum:0,active:true,scaled:false};

type FormState=typeof emptyForm;

export function ProductCharacteristics(){
  const {id}=useParams<{id:string}>();
  const navigate=useNavigate();
  const [companyId,setCompanyId]=useState<number|null>(null);
  const [product,setProduct]=useState<Product|null>(null);
  const [rows,setRows]=useState<ProductCharacteristic[]>([]);
  const [status,setStatus]=useState<ProductStatus>('active');
  const [editing,setEditing]=useState<number|null>(null);
  const [form,setForm]=useState<FormState>(emptyForm);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{getActiveCompanies().then(cs=>setCompanyId(cs[0]?.id??null)).catch(e=>setError(e instanceof Error?e.message:'No se pudo obtener la empresa activa.'));},[]);
  useEffect(()=>{if(companyId&&id)load();},[companyId,id,status]);

  async function load(){
    if(!companyId||!id)return;
    setLoading(true);setError('');
    try{const [detail,characteristics]=await Promise.all([getProduct(companyId,Number(id)),listProductCharacteristics(Number(id),status)]);setProduct(detail.product);setRows(characteristics);}
    catch(e){setError(e instanceof Error?e.message:'No se pudieron cargar las características.')}
    finally{setLoading(false)}
  }

  function edit(row:ProductCharacteristic){setEditing(row.id);setForm({code:row.code,description:row.description??'',upc:row.upc,ptc:row.ptc,pvp:row.pvp,price_increment:row.price_increment,stock_minimum:row.stock_minimum,active:row.active,scaled:row.scaled});setError('');}
  function cancel(){setEditing(null);setForm(emptyForm);setError('');}

  async function save(){
    if(!id)return;
    if(!form.code.trim()||!form.description.trim()){setError('Código y descripción son obligatorios.');return;}
    setSaving(true);setError('');
    try{
      const payload={...form,code:form.code.trim(),description:form.description.trim()};
      if(editing===0) await createProductCharacteristic(Number(id),payload);
      else if(editing!==null) await updateProductCharacteristic(editing,payload);
      cancel();await load();
    }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar la característica.')}
    finally{setSaving(false)}
  }

  async function mark(row:ProductCharacteristic){if(!window.confirm(`¿Marcar la característica ${row.code} para borrado? No se eliminará físicamente y podrá recuperarse.`))return;try{await markProductCharacteristicForDeletion(row.id);await load()}catch(e){setError(e instanceof Error?e.message:'No se pudo marcar para borrado.')}}
  async function restore(row:ProductCharacteristic){try{await restoreProductCharacteristic(row.id);await load()}catch(e){setError(e instanceof Error?e.message:'No se pudo recuperar la característica.')}}

  if(loading)return <div className="loading-block">Cargando características…</div>;
  return <div className="module-page product-page">
    <div className="page-head">
      <div><div className="eyebrow">VENTAS / ARTÍCULOS / CARACTERÍSTICAS</div><h1>{product?.code??'Artículo'}</h1><p>{product?.commercial_description||product?.technical_description||'Gestión de características del artículo.'}</p></div>
      <div className="product-head-actions"><Link className="secondary-button" to={id?`/ventas/articulos/${id}`:'/ventas/articulos'}><ArrowLeft size={15}/> Volver al artículo</Link><button className="primary-button" onClick={()=>{setEditing(0);setForm(emptyForm);setError('')}}><Plus size={16}/> Añadir característica</button></div>
    </div>
    {error&&<div className="inline-error">{error}</div>}
    <div className="toolbar"><select value={status} onChange={e=>setStatus(e.target.value as ProductStatus)} aria-label="Estado"><option value="active">Activas</option><option value="inactive">Inactivas</option><option value="deleted">Marcadas para borrado</option><option value="all">Todas</option></select></div>
    {editing!==null&&<section className="panel characteristic-editor"><div className="panel-head"><div><h2>{editing===0?'Nueva característica':'Editar característica'}</h2><p>La característica pertenece al artículo y puede tener valores comerciales propios.</p></div></div><div className="form-grid"><label>Código *<input value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/></label><label>Descripción *<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>UPC<input type="number" step="0.01" value={form.upc??''} onChange={e=>setForm({...form,upc:e.target.value===''?null:Number(e.target.value)})}/></label><label>PTC<input type="number" step="0.01" value={form.ptc??''} onChange={e=>setForm({...form,ptc:e.target.value===''?null:Number(e.target.value)})}/></label><label>PVP<input type="number" step="0.01" value={form.pvp??''} onChange={e=>setForm({...form,pvp:e.target.value===''?null:Number(e.target.value)})}/></label><label>Incremento de precio<input type="number" step="0.01" value={form.price_increment} onChange={e=>setForm({...form,price_increment:Number(e.target.value)})}/></label><label>Stock mínimo<input type="number" min="0" step="1" value={form.stock_minimum} onChange={e=>setForm({...form,stock_minimum:Number(e.target.value)})}/></label><label>Estado<select value={form.active?'1':'0'} onChange={e=>setForm({...form,active:e.target.value==='1'})}><option value="1">Activo</option><option value="0">Inactivo</option></select></label><label className="check-card"><input type="checkbox" checked={form.scaled} onChange={e=>setForm({...form,scaled:e.target.checked})}/><span><strong>Escalado</strong><small>La gestión de escalados se desarrollará en una fase posterior.</small></span></label></div><div className="actions"><button type="button" className="secondary-button" onClick={cancel}>Cancelar</button><button type="button" className="primary-button" disabled={saving} onClick={save}><Save size={15}/>{saving?'Guardando…':'Guardar'}</button></div></section>}
    <section className="panel"><div className="panel-head"><div><h2>Características</h2><p>Características propias de este artículo.</p></div><span className="result-count">{rows.length} registros</span></div><div className="table-panel product-table"><table><thead><tr><th>Código</th><th>Descripción</th><th>UPC</th><th>PTC</th><th>PVP</th><th>Estado</th><th></th></tr></thead><tbody>{rows.length===0?<tr><td colSpan={7}><div className="empty-state">No hay características para este artículo.</div></td></tr>:rows.map(row=>{const deleted=!!row.deleted_at;return <tr key={row.id}><td>{row.code}</td><td>{row.description||'—'}</td><td>{row.upc??'—'}</td><td>{row.ptc??'—'}</td><td>{row.pvp==null?'—':Number(row.pvp).toFixed(2)+' €'}</td><td><span className={`status ${deleted||!row.active?'inactive':'active'}`}>{deleted?'Marcada para borrado':row.active?'Activa':'Inactiva'}</span></td><td><div className="item-actions">{!deleted&&<button className="icon-action" title="Editar" onClick={()=>edit(row)}><Edit3 size={15}/></button>}{deleted?<button className="icon-action" title="Recuperar" onClick={()=>restore(row)}><Undo2 size={15}/></button>:<button className="icon-action danger" title="Marcar para borrado" onClick={()=>mark(row)}><Trash2 size={15}/></button>}</div></td></tr>})}</tbody></table></div></section>
  </div>;
}
