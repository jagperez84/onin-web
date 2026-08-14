import { useEffect, useState } from 'react';
import { Edit3, Plus, Save, Search, Trash2, Undo2, X } from 'lucide-react';
import { getActiveCompanies } from '../../services/core/coreRepository';
import { listProductCharacteristics, type ProductCharacteristic } from '../../services/catalog/productRepository';
import { createProductScale, createProductSupplier, listProductScales, listProductSuppliers, markProductScaleForDeletion, markProductSupplierForDeletion, restoreProductScale, restoreProductSupplier, updateProductScale, updateProductSupplier, type ProductScaleInput, type ProductScaleRow, type ProductSupplierInput, type ProductSupplierRow } from '../../services/catalog/productCommercialRepository';
import { supabase } from '../../lib/supabase';

type Props={productId:number;onError:(message:string)=>void};
type SupplierRef={id:number;name:string};
type CommercialForm={supplier_party_id:number|null;supplier_code:string;price_type:string;price:number|null;discount_percent:number;active:boolean;characteristic_id:number|null;delivery_days:number|null};
type ScaleForm={dimension_1:number;dimension_2:number|null;price:number;characteristic_id:number|null};

const emptySupplier=():CommercialForm=>({supplier_party_id:null,supplier_code:'',price_type:'STANDARD',price:null,discount_percent:0,active:true,characteristic_id:null,delivery_days:null});
const emptyScale=():ScaleForm=>({dimension_1:0,dimension_2:null,price:0,characteristic_id:null});

function EntitySearchHelp({title,placeholder,items,value,onChange,labelOf,required=false}:{title:string;placeholder:string;items:{id:number}[];value:number|null;onChange:(id:number|null)=>void;labelOf:(item:{id:number})=>string;required?:boolean}){
 const [open,setOpen]=useState(false); const [query,setQuery]=useState('');
 const selected=items.find(s=>s.id===value)??null;
 const filtered=items.filter(s=>labelOf(s).toLowerCase().includes(query.trim().toLowerCase()));
 function select(id:number){onChange(id);setOpen(false);setQuery('');}
 return <>
   <div className="entity-lookup-field">
     <button type="button" className="entity-lookup-trigger" onClick={()=>setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
       <span className={selected?'':'entity-lookup-placeholder'}>{selected?labelOf(selected):placeholder}</span>
       <Search size={16}/>
     </button>
     {selected&&!required&&<button type="button" className="entity-lookup-clear" title="Quitar selección" onClick={()=>onChange(null)}><X size={14}/></button>}
   </div>
   {open&&<div className="entity-lookup-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
     <div className="entity-lookup-dialog" role="dialog" aria-modal="true" aria-label={title}>
       <div className="entity-lookup-head"><div><h3>{title}</h3><p>Busca y selecciona una entidad existente.</p></div><button type="button" className="icon-action" title="Cerrar" onClick={()=>setOpen(false)}><X size={17}/></button></div>
       <label className="entity-lookup-search"><Search size={16}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar…"/></label>
       <div className="entity-lookup-results">
         {filtered.length===0?<div className="empty-state">No se han encontrado resultados.</div>:filtered.map(s=><button key={s.id} type="button" className={`entity-lookup-result${s.id===value?' selected':''}`} onClick={()=>select(s.id)}><span>{labelOf(s)}</span>{s.id===value&&<span className="status active">Seleccionado</span>}</button>)}
       </div>
       <div className="actions"><button type="button" className="secondary-button" onClick={()=>setOpen(false)}>Cancelar</button></div>
     </div>
   </div>}
 </>;
}

export function ProductCommercialPanel({productId,onError}:Props){
 const [suppliers,setSuppliers]=useState<SupplierRef[]>([]); const [characteristics,setCharacteristics]=useState<ProductCharacteristic[]>([]);
 const [supplierRows,setSupplierRows]=useState<ProductSupplierRow[]>([]); const [scaleRows,setScaleRows]=useState<ProductScaleRow[]>([]);
 const [supplierEditing,setSupplierEditing]=useState<number|null>(null); const [scaleEditing,setScaleEditing]=useState<number|null>(null);
 const [supplierForm,setSupplierForm]=useState(emptySupplier()); const [scaleForm,setScaleForm]=useState(emptyScale()); const [saving,setSaving]=useState(false);
 useEffect(()=>{load();},[productId]);
 async function load(){try{
   const company=await getActiveCompanies(); const companyId=company[0]?.id;
   const [sr,cr,sc,refs]=await Promise.all([listProductSuppliers(productId),listProductCharacteristics(productId,'active'),listProductScales(productId),companyId?loadSuppliers(companyId):Promise.resolve([])]);
   setSupplierRows(sr);setCharacteristics(cr);setScaleRows(sc);setSuppliers(refs);
 }catch(e){onError(e instanceof Error?e.message:'No se pudo cargar la información comercial.');}}
 async function loadSuppliers(companyId:number):Promise<SupplierRef[]>{if(!supabase)return[];const pr=await supabase.from('party_role').select('party_id').eq('role_code','SUPPLIER').eq('active',true);if(pr.error)throw pr.error;const ids=(pr.data??[]).map(x=>x.party_id);if(!ids.length)return[];const p=await supabase.from('party').select('id,legal_name,trade_name').eq('company_id',companyId).eq('active',true).in('id',ids).order('legal_name');if(p.error)throw p.error;return (p.data??[]).map(x=>({id:x.id,name:x.trade_name||x.legal_name}));}
 function startSupplier(row?:ProductSupplierRow){setSupplierEditing(row?.id??0);setSupplierForm(row?{supplier_party_id:row.supplier_party_id,supplier_code:row.supplier_code??'',price_type:row.price_type??'STANDARD',price:row.price,discount_percent:row.discount_percent,active:row.active,characteristic_id:row.characteristic_id,delivery_days:row.delivery_days}:{...emptySupplier()});}
 function startScale(row?:ProductScaleRow){setScaleEditing(row?.id??0);setScaleForm(row?{dimension_1:row.dimension_1,dimension_2:row.dimension_2,price:row.price,characteristic_id:row.characteristic_id}:{...emptyScale()});}
 function cancelSupplier(){setSupplierEditing(null);setSupplierForm(emptySupplier());}
 function cancelScale(){setScaleEditing(null);setScaleForm(emptyScale());}
 async function saveSupplier(){if(!supplierForm.supplier_party_id){onError('Selecciona un proveedor.');return}setSaving(true);try{const payload={...supplierForm,active:true};if(supplierEditing===0)await createProductSupplier(productId,payload as ProductSupplierInput);else if(supplierEditing!==null)await updateProductSupplier(supplierEditing,payload as Partial<ProductSupplierInput>);cancelSupplier();await load();}catch(e){onError(e instanceof Error?e.message:'No se pudo guardar el proveedor.')}finally{setSaving(false)}}
 async function saveScale(){if(scaleForm.dimension_1<=0){onError('La primera dimensión debe ser mayor que 0.');return}if(scaleForm.price<=0){onError('El precio del escalado debe ser mayor que 0.');return}setSaving(true);try{if(scaleEditing===0)await createProductScale(productId,scaleForm as ProductScaleInput);else if(scaleEditing!==null)await updateProductScale(scaleEditing,scaleForm as ProductScaleInput);cancelScale();await load();}catch(e){onError(e instanceof Error?e.message:'No se pudo guardar el escalado.')}finally{setSaving(false)}}
 async function deleteSupplier(row:ProductSupplierRow){if(!window.confirm(`¿Borrar la relación con ${row.supplier_name}? El proveedor no se eliminará y la relación podrá recuperarse.`))return;try{await markProductSupplierForDeletion(row.id);await load();}catch(e){onError(e instanceof Error?e.message:'No se pudo borrar la relación con el proveedor.')}}
 async function restoreSupplier(row:ProductSupplierRow){try{await restoreProductSupplier(row.id);await load();}catch(e){onError(e instanceof Error?e.message:'No se pudo recuperar la relación con el proveedor.')}}
 async function deleteScale(row:ProductScaleRow){if(!window.confirm('¿Borrar este escalado? El artículo no se eliminará y la línea podrá recuperarse.'))return;try{await markProductScaleForDeletion(row.id);await load();}catch(e){onError(e instanceof Error?e.message:'No se pudo borrar el escalado.')}}
 async function restoreScale(row:ProductScaleRow){try{await restoreProductScale(row.id);await load();}catch(e){onError(e instanceof Error?e.message:'No se pudo recuperar el escalado.')}}
 const characteristicItems=characteristics as unknown as {id:number}[];
 const characteristicLabel=(item:{id:number})=>{const c=characteristics.find(x=>x.id===item.id);return c?`${c.code} · ${c.description}`:`Característica ${item.id}`;};
 const marginHint='El margen se calcula sobre precio de venta y compra del artículo; los descuentos de compra se gestionan por proveedor.';
 return <section className="panel product-commercial-panel"><div className="panel-head"><div><h2>Precios y condiciones comerciales</h2><p>{marginHint}</p></div></div>
   <div className="commercial-summary"><div><span>Precio venta</span><strong>Se gestiona en Datos comerciales</strong></div><div><span>Proveedores</span><strong>{supplierRows.length}</strong></div><div><span>Escalados</span><strong>{scaleRows.length}</strong></div></div>
   <div className="panel-head commercial-subhead"><div><h3>Proveedores</h3><p>El descuento aquí es de compra y pertenece al proveedor.</p></div><button className="secondary-button" type="button" onClick={()=>startSupplier()}><Plus size={15}/> Añadir proveedor</button></div>
   {supplierEditing!==null&&<div className="characteristic-inline-editor"><div className="form-grid"><label>Proveedor *<EntitySearchHelp title="Buscar proveedor" placeholder="Seleccionar proveedor…" items={suppliers} value={supplierForm.supplier_party_id} onChange={id=>setSupplierForm({...supplierForm,supplier_party_id:id})} labelOf={item=>suppliers.find(x=>x.id===item.id)?.name??`Proveedor ${item.id}`} required/></label><label>Código proveedor<input className="field-md" value={supplierForm.supplier_code} onChange={e=>setSupplierForm({...supplierForm,supplier_code:e.target.value})}/></label><label>Tipo precio<select className="field-md" value={supplierForm.price_type} onChange={e=>setSupplierForm({...supplierForm,price_type:e.target.value})}><option value="STANDARD">Estándar</option><option value="NET">Neto</option></select></label><label>Precio compra<input type="number" step="0.01" className="field-sm" value={supplierForm.price??''} onChange={e=>setSupplierForm({...supplierForm,price:e.target.value===''?null:Number(e.target.value)})}/></label><label>Descuento %<input type="number" step="0.01" min="0" max="100" className="field-sm" value={supplierForm.discount_percent} onChange={e=>setSupplierForm({...supplierForm,discount_percent:Number(e.target.value)})}/></label><label>Días entrega<input type="number" step="1" min="0" className="field-sm" value={supplierForm.delivery_days??''} onChange={e=>setSupplierForm({...supplierForm,delivery_days:e.target.value===''?null:Number(e.target.value)})}/></label><label>Característica<EntitySearchHelp title="Buscar característica" placeholder="General (sin característica)" items={characteristicItems} value={supplierForm.characteristic_id} onChange={id=>setSupplierForm({...supplierForm,characteristic_id:id})} labelOf={characteristicLabel}/></label></div><div className="actions"><button type="button" className="secondary-button" onClick={cancelSupplier}>Cancelar</button><button type="button" className="primary-button" disabled={saving} onClick={saveSupplier}><Save size={15}/>Guardar</button></div></div>}
   <div className="table-panel product-table"><table><thead><tr><th>Proveedor</th><th>Código</th><th>Característica</th><th>Precio</th><th>Dto. compra</th><th>Entrega</th><th>Estado</th><th></th></tr></thead><tbody>{supplierRows.length===0?<tr><td colSpan={8}><div className="empty-state">No hay proveedores definidos para este artículo.</div></td></tr>:supplierRows.map(r=><tr key={r.id} className={!r.active?'muted-row':''}><td>{r.supplier_name}</td><td>{r.supplier_code||'—'}</td><td>{r.characteristic_code||'General'}</td><td>{r.price==null?'—':Number(r.price).toFixed(2)+' €'}</td><td>{Number(r.discount_percent).toFixed(2)} %</td><td>{r.delivery_days==null?'—':`${r.delivery_days} días`}</td><td><span className={`status ${r.active?'active':'inactive'}`}>{r.active?'Activo':'Marcado para borrado'}</span></td><td><button className="icon-action" title="Editar" onClick={()=>startSupplier(r)}><Edit3 size={15}/></button>{r.active?<button className="icon-action" title="Borrar relación" onClick={()=>deleteSupplier(r)}><Trash2 size={15}/></button>:<button className="icon-action" title="Recuperar relación" onClick={()=>restoreSupplier(r)}><Undo2 size={15}/></button>}</td></tr>)}</tbody></table></div>
   <div className="panel-head commercial-subhead"><div><h3>Escalados</h3><p>Las líneas con precio 0 no se permiten. La característica es opcional.</p></div><button className="secondary-button" type="button" onClick={()=>startScale()}><Plus size={15}/> Añadir escalado</button></div>
   {scaleEditing!==null&&<div className="characteristic-inline-editor"><div className="form-grid"><label>Dimensión 1 *<input type="number" step="0.01" min="0" className="field-sm" value={scaleForm.dimension_1} onChange={e=>setScaleForm({...scaleForm,dimension_1:Number(e.target.value)})}/></label><label>Dimensión 2<input type="number" step="0.01" min="0" className="field-sm" value={scaleForm.dimension_2??''} onChange={e=>setScaleForm({...scaleForm,dimension_2:e.target.value===''?null:Number(e.target.value)})}/></label><label>Precio *<input type="number" step="0.01" min="0" className="field-sm" value={scaleForm.price} onChange={e=>setScaleForm({...scaleForm,price:Number(e.target.value)})}/></label><label>Característica<EntitySearchHelp title="Buscar característica" placeholder="General (sin característica)" items={characteristicItems} value={scaleForm.characteristic_id} onChange={id=>setScaleForm({...scaleForm,characteristic_id:id})} labelOf={characteristicLabel}/></label></div><div className="actions"><button type="button" className="secondary-button" onClick={cancelScale}>Cancelar</button><button type="button" className="primary-button" disabled={saving} onClick={saveScale}><Save size={15}/>Guardar</button></div></div>}
   <div className="table-panel product-table"><table><thead><tr><th>Dimensión 1</th><th>Dimensión 2</th><th>Característica</th><th>Precio</th><th></th></tr></thead><tbody>{scaleRows.length===0?<tr><td colSpan={5}><div className="empty-state">No hay escalados definidos para este artículo.</div></td></tr>:scaleRows.map(r=><tr key={r.id}><td>{Number(r.dimension_1)}</td><td>{r.dimension_2==null?'—':Number(r.dimension_2)}</td><td>{r.characteristic_code||'General'}</td><td>{Number(r.price).toFixed(2)+' €'}</td><td><button className="icon-action" title="Editar" onClick={()=>startScale(r)}><Edit3 size={15}/></button><button className="icon-action" title="Borrar escalado" onClick={()=>deleteScale(r)}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div>
 </section>;
}
