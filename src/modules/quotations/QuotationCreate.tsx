import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronDown, ChevronUp, Maximize2, Minimize2, Plus, Search, Trash2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import { createQuotation, customerAddresses, quotationOptions } from '../../services/sales/quotationCreationRepository';
import { MessageLog } from '../../components/ui/MessageLog';
import { ProfileSaveBar } from '../../components/ui/ProfileSaveBar';
import './quotation-create.css';

const today=()=>new Date().toISOString().slice(0,10);
const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'});
type Line={product_id:number|null;description:string;quantity:number;unit_price:number;discount_percent:number};
const blank=():Line=>({product_id:null,description:'',quantity:1,unit_price:0,discount_percent:0});
type Option={id:number;label:string;code?:string;price?:number};

export function QuotationCreate(){
 const nav=useNavigate();
 const [opts,setOpts]=useState<any>(); const [addresses,setAddresses]=useState<any[]>([]); const [customerId,setCustomerId]=useState<number|null>(null);
 const [commercialId,setCommercialId]=useState<number|null>(null); const [warehouseId,setWarehouseId]=useState<number|null>(null); const [billingId,setBillingId]=useState<number|null>(null);
 const [installationId,setInstallationId]=useState<number|null>(null); const [paymentMethodId,setPaymentMethodId]=useState<number|null>(null); const [paymentTermId,setPaymentTermId]=useState<number|null>(null);
 const [taxRateId,setTaxRateId]=useState<number|null>(null); const [taxPercent,setTaxPercent]=useState(0); const [issueDate,setIssueDate]=useState(today()); const [validUntil,setValidUntil]=useState('');
 const [reference,setReference]=useState(''); const [notes,setNotes]=useState(''); const [lines,setLines]=useState<Line[]>([blank()]); const [error,setError]=useState('');
 const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false); const [headerCollapsed,setHeaderCollapsed]=useState(false); const [linesExpanded,setLinesExpanded]=useState(false);
 useEffect(()=>{void quotationOptions().then(setOpts).catch(e=>setError(e instanceof Error?e.message:'No se pudieron cargar los datos.')).finally(()=>setLoading(false));},[]);
 useEffect(()=>{if(!customerId){setAddresses([]);setBillingId(null);setInstallationId(null);return;} void customerAddresses(customerId).then(rows=>{setAddresses(rows);const billing=rows.find((a:any)=>['FACTURACION','FISCAL'].includes(String(a.address_type).toUpperCase()));const installation=rows.find((a:any)=>String(a.address_type).toUpperCase()==='INSTALACION');setBillingId(billing?.id??null);setInstallationId(installation?.id??null);}).catch(e=>setError(e instanceof Error?e.message:'No se pudieron cargar las direcciones del cliente.'));},[customerId]);
 const totals=useMemo(()=>lines.reduce((a,l)=>{const net=Math.max(0,l.quantity*l.unit_price*(1-l.discount_percent/100));return{net:a.net+net,tax:a.tax+net*taxPercent/100,total:a.total+net*(1+taxPercent/100)};},{net:0,tax:0,total:0}),[lines,taxPercent]);
 const change=(i:number,key:keyof Line,value:string)=>setLines(xs=>xs.map((l,j)=>j===i?{...l,[key]:key==='description'?value:Number(value)}:l));
 const product=(i:number,id:number|null)=>{const p=opts?.products?.find((x:any)=>x.id===id);setLines(xs=>xs.map((l,j)=>j===i?{...l,product_id:id,description:p?.label||'',unit_price:p?.price??0}:l));};
 async function save(e?:React.FormEvent){e?.preventDefault();setError('');if(!customerId){setError('Selecciona un cliente.');return;}setSaving(true);try{await createQuotation({customer_id:customerId,commercial_id:commercialId,warehouse_id:warehouseId,billing_address_id:billingId,installation_address_id:installationId,payment_method_id:paymentMethodId,payment_term_id:paymentTermId,measurement_id:null,tax_rate_id:taxRateId,tax_percent:taxPercent,issue_date:issueDate,valid_until:validUntil||null,reference,notes,lines});nav('/ventas/presupuestos');}catch(e){setError(e instanceof CoreRepositoryError?e.message:e instanceof Error?e.message:'No se pudo guardar el presupuesto.');}finally{setSaving(false);}}
 if(loading)return <div className="module-page"><div className="page-head"><div><div className="eyebrow">VENTAS / PRESUPUESTOS / NUEVO</div><h1>Nuevo presupuesto</h1></div></div><p>Cargando datos…</p></div>;
 return <div className={`module-page quotation-create ${linesExpanded?'quotation-lines-expanded':''}`}>
  <div className="page-head"><div><div className="eyebrow">VENTAS / PRESUPUESTOS / NUEVO</div><h1>Nuevo presupuesto</h1><p>Crear presupuesto en estado borrador.</p></div><Link className="secondary-button" to="/ventas/presupuestos"><ArrowLeft size={15}/>Volver a presupuestos</Link></div>
  <MessageLog error={error}/>
  <form id="quotation-create-form" className="detail-grid" onSubmit={save}>
   <section className="panel quotation-header-panel">
    <div className="panel-head"><div><h2>Datos generales</h2><p>Cliente, condiciones comerciales y direcciones del presupuesto.</p></div><button type="button" className="secondary-button" onClick={()=>setHeaderCollapsed(v=>!v)}>{headerCollapsed?<><ChevronDown size={15}/>Mostrar cabecera</>:<><ChevronUp size={15}/>Contraer cabecera</>}</button></div>
    {!headerCollapsed&&<div className="form-grid">
     <LookupSelect label="Cliente" required options={opts.customers} value={customerId} onChange={id=>{setCustomerId(id);setBillingId(null);setInstallationId(null);}} placeholder="Buscar cliente por nombre…" />
     <label>Comercial<select value={commercialId??''} onChange={e=>setCommercialId(e.target.value?Number(e.target.value):null)}><option value="">Sin asignar</option>{opts.commercials.map((x:any)=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
     <label>Almacén<select value={warehouseId??''} onChange={e=>setWarehouseId(e.target.value?Number(e.target.value):null)}><option value="">Sin asignar</option>{opts.warehouses.map((x:any)=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
     <label>Fecha<input type="date" value={issueDate} onChange={e=>setIssueDate(e.target.value)} required/></label><label>Válido hasta<input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)}/></label><label>Referencia<input value={reference} onChange={e=>setReference(e.target.value)} /></label>
     <label>Forma de pago<select value={paymentMethodId??''} onChange={e=>setPaymentMethodId(e.target.value?Number(e.target.value):null)}><option value="">Sin especificar</option>{opts.paymentMethods.map((x:any)=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
     <label>Condiciones de pago<select value={paymentTermId??''} onChange={e=>setPaymentTermId(e.target.value?Number(e.target.value):null)}><option value="">Sin especificar</option>{opts.paymentTerms.map((x:any)=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
     <label>IVA<select value={taxRateId??''} onChange={e=>{const id=e.target.value?Number(e.target.value):null;const t=opts.taxRates.find((x:any)=>x.id===id);setTaxRateId(id);setTaxPercent(Number(t?.rate??0));}}><option value="">Sin IVA</option>{opts.taxRates.map((t:any)=><option key={t.id} value={t.id}>{t.rate}% · {t.label}</option>)}</select></label>
     <label>Dirección de facturación<select value={billingId??''} onChange={e=>setBillingId(e.target.value?Number(e.target.value):null)}><option value="">Sin especificar</option>{addresses.map(a=><option key={a.id} value={a.id}>{addressLabel(a)}</option>)}</select></label>
     <label>Dirección de instalación<select value={installationId??''} onChange={e=>setInstallationId(e.target.value?Number(e.target.value):null)}><option value="">Sin especificar</option>{addresses.map(a=><option key={a.id} value={a.id}>{addressLabel(a)}</option>)}</select></label>
    </div>}
   </section>
   <section className={`panel quotation-lines-panel ${linesExpanded?'expanded':''}`}>
    <div className="panel-head"><div><h2>Líneas del presupuesto</h2><p>Añade artículos, cantidades, precios y descuentos. El IVA se aplica desde la cabecera.</p></div><div className="panel-actions"><button type="button" className="secondary-button" onClick={()=>setLinesExpanded(v=>!v)}>{linesExpanded?<><Minimize2 size={15}/>Reducir espacio</>:<><Maximize2 size={15}/>Ampliar espacio</>}</button><button type="button" className="primary-button" onClick={()=>setLines(xs=>[...xs,blank()])}><Plus size={15}/>Añadir línea</button></div></div>
    <div className="table-panel quotation-lines-table"><table><thead><tr><th>Artículo</th><th>Descripción</th><th>Cantidad</th><th>Precio</th><th>Dto. %</th><th className="numeric">Total</th><th></th></tr></thead><tbody>{lines.map((l,i)=>{const total=Math.max(0,l.quantity*l.unit_price*(1-l.discount_percent/100))*(1+taxPercent/100);return <tr key={i}><td><LookupSelect compact options={opts.products} value={l.product_id} onChange={id=>product(i,id)} placeholder="Buscar artículo por código o descripción…" /></td><td><input value={l.description} onChange={e=>change(i,'description',e.target.value)} required /></td><td><input type="number" min="0.01" step="0.01" value={l.quantity} onChange={e=>change(i,'quantity',e.target.value)} /></td><td><input type="number" min="0" step="0.01" value={l.unit_price} onChange={e=>change(i,'unit_price',e.target.value)} /></td><td><input type="number" min="0" max="100" step="0.01" value={l.discount_percent} onChange={e=>change(i,'discount_percent',e.target.value)} /></td><td className="numeric">{money(total)}</td><td><button type="button" className="icon-button" aria-label="Eliminar línea" disabled={lines.length===1} onClick={()=>setLines(xs=>xs.filter((_,j)=>j!==i))}><Trash2 size={16}/></button></td></tr>})}</tbody></table></div>
    <div className="quote-totals"><span>Base imponible <strong>{money(totals.net)}</strong></span><span>IVA ({taxPercent}%) <strong>{money(totals.tax)}</strong></span><span>Total <strong>{money(totals.total)}</strong></span></div>
   </section>
   <section className="panel"><div className="panel-head"><div><h2>Observaciones</h2><p>Información adicional que quedará asociada al presupuesto.</p></div></div><label className="wide-field">Observaciones<textarea rows={5} value={notes} onChange={e=>setNotes(e.target.value)} /></label></section>
  </form>
  <ProfileSaveBar onSave={()=>{const formElement=document.getElementById('quotation-create-form') as HTMLFormElement|null;formElement?.requestSubmit();}} saving={saving} label="Crear presupuesto" />
 </div>;
}

function addressLabel(a:any){return [a.label||({FACTURACION:'Facturación',FISCAL:'Fiscal',INSTALACION:'Instalación'} as Record<string,string>)[String(a.address_type).toUpperCase()]||'Dirección',a.street,a.postal_code,a.city].filter(Boolean).join(' · ');}

function LookupSelect({label,required=false,compact=false,options,value,onChange,placeholder}:{label?:string;required?:boolean;compact?:boolean;options:Option[];value:number|null;onChange:(id:number|null)=>void;placeholder:string}){
 const [query,setQuery]=useState(''); const [open,setOpen]=useState(false); const [rect,setRect]=useState<DOMRect|null>(null); const inputRef=useRef<HTMLInputElement|null>(null);
 const selected=options.find(x=>x.id===value);
 const filtered=useMemo(()=>{const q=query.trim().toLocaleLowerCase();if(!q)return options.slice(0,10);return options.filter(x=>`${x.code??''} ${x.label}`.toLocaleLowerCase().includes(q)).slice(0,10);},[options,query]);
 const reposition=()=>{if(inputRef.current)setRect(inputRef.current.getBoundingClientRect());};
 useEffect(()=>{if(!open)return;reposition();const onScroll=()=>reposition();window.addEventListener('scroll',onScroll,true);window.addEventListener('resize',onScroll);return()=>{window.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',onScroll);};},[open]);
 return <div className={`lookup-field ${compact?'lookup-field-compact':''}`}>
  {label&&<span className="field-label">{label}{required?' *':''}</span>}
  <div className="lookup-control"><Search size={15}/><input ref={inputRef} required={required&&!value} value={open?query:(selected?.label??'')} placeholder={placeholder} onFocus={()=>{setOpen(true);if(selected)setQuery(selected.label);}} onChange={e=>{setQuery(e.target.value);setOpen(true);if(value!==null)onChange(null);}} />{selected&&<button type="button" className="lookup-clear" aria-label="Limpiar selección" onClick={()=>{setQuery('');onChange(null);setOpen(false);}}><X size={14}/></button>}</div>
  {open&&rect&&createPortal(<div className="lookup-portal"><button type="button" className="lookup-dismiss" aria-label="Cerrar resultados" onClick={()=>setOpen(false)} /><div className="lookup-results" style={{top:rect.bottom+4,left:rect.left,width:Math.max(rect.width,280)}}>{filtered.length===0?<small>No se han encontrado resultados.</small>:filtered.map(x=><button type="button" key={x.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(x.id);setQuery('');setOpen(false);}}><strong>{x.code?`${x.code} · `:''}{x.label}</strong></button>)}</div></div>,document.body)}
 </div>;
}
