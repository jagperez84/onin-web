import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, CreditCard, FileText, Hash, Tag, UserRound, Warehouse, Clock3 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import './quotation.css';

type Detail = { id:number; code:string; issue_date:string; valid_until:string|null; status:string; reference:string|null; notes:string|null; net_amount:number; discount_amount:number; tax_amount:number; total_amount:number; customer:any; commercial:any; warehouse:any; payment_method:any; payment_term:any; lines:any[] };
const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const date=(value:string|null)=>value?new Date(`${value}T00:00:00`).toLocaleDateString('es-ES'):'—';
const statusLabel=(s:string)=>({DRAFT:'Borrador',SENT:'Enviado',ACCEPTED:'Aceptado',REJECTED:'Rechazado',EXPIRED:'Caducado'} as Record<string,string>)[s]||s;
const partyName=(p:any)=>p?.party?.trade_name||p?.party?.legal_name||'Sin asignar';

function quotationTotals(lines:any[]){
 return (lines??[]).reduce((totals,line)=>{
  const quantity=Number(line.quantity||0);
  const unitPrice=Number(line.unit_price||0);
  const lineNet=Number(line.net_amount||0);
  const lineTax=Number(line.tax_amount||0);
  const gross=quantity*unitPrice;
  return {
   base:totals.base+lineNet,
   discount:totals.discount+(gross-lineNet),
   tax:totals.tax+lineTax,
   total:totals.total+Number(line.total_amount||0),
  };
 },{base:0,discount:0,tax:0,total:0});
}

export function QuotationDetail(){
 const {id}=useParams(); const nav=useNavigate(); const [data,setData]=useState<Detail|null>(null); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{if(!supabase)throw new CoreRepositoryError('Supabase no está configurado.');const {data:{user},error:ue}=await supabase.auth.getUser();if(ue||!user)throw new CoreRepositoryError('No hay un usuario autenticado.');const {data:ua,error:uae}=await supabase.from('user_account').select('company_id').eq('auth_user_id',user.id).maybeSingle();if(uae)throw new CoreRepositoryError(uae.message);if(ua?.company_id==null)throw new CoreRepositoryError('El usuario no tiene empresa asignada.');const {data:q,error:qe}=await supabase.from('quotation').select('id,code,issue_date,valid_until,status,reference,notes,net_amount,discount_amount,tax_amount,total_amount,customer:customer_id(party:party_id(legal_name,trade_name)),commercial:commercial_id(party:party_id(legal_name,trade_name)),warehouse:warehouse_id(code,name),payment_method:payment_method_id(code,name),payment_term:payment_term_id(code,name),lines:quotation_line(id,line_no,description,quantity,unit_price,discount_percent,tax_percent,net_amount,tax_amount,total_amount,product:product_id(code,commercial_description,technical_description))').eq('company_id',ua.company_id).eq('id',Number(id)).maybeSingle();if(qe)throw new CoreRepositoryError(qe.message);if(!q)throw new CoreRepositoryError('Presupuesto no encontrado.');if(active)setData(q as unknown as Detail);}catch(e){if(active)setError(e instanceof Error?e.message:'No se pudo cargar el presupuesto.');}finally{if(active)setLoading(false);}})();return()=>{active=false};},[id]);
 if(loading)return <div className="loading-block">Cargando presupuesto…</div>;
 if(error||!data)return <div className="module-page"><div className="page-head"><div><div className="eyebrow">VENTAS / PRESUPUESTOS</div><h1>Presupuesto</h1></div></div><div className="inline-error">{error||'Presupuesto no encontrado.'}</div></div>;
 const totals=quotationTotals(data.lines);
 return <div className="module-page quotation-page">
   <div className="quotation-detail-head">
     <div className="quotation-detail-title">
       <Link className="secondary-button" to="/ventas/presupuestos"><ArrowLeft size={15}/>Volver a presupuestos</Link>
       <div className="eyebrow">VENTAS / PRESUPUESTOS</div>
       <div className="quotation-title-row"><h1>{data.code}</h1><span className={`quotation-status ${data.status.toLowerCase()}`}>{statusLabel(data.status)}</span></div>
       <p>{partyName(data.customer)} <span>·</span> {date(data.issue_date)}</p>
     </div>
     <div className="quotation-head-meta"><div><span>Referencia</span><strong>{data.reference||'Sin referencia'}</strong></div><div><span>Validez</span><strong>{data.valid_until?date(data.valid_until):'Sin especificar'}</strong></div></div>
   </div>

   <nav className="quotation-section-nav" aria-label="Navegación del presupuesto"><a className="active" href="#resumen">Resumen</a><a href="#lineas">Líneas del presupuesto</a><a href="#observaciones">Observaciones</a></nav>

   <section id="resumen" className="quotation-info-card quotation-anchor">
     <div className="quotation-info-grid">
       <div className="quotation-info-item"><span><UserRound size={15}/>Cliente</span><strong>{partyName(data.customer)}</strong></div>
       <div className="quotation-info-item"><span><UserRound size={15}/>Comercial</span><strong>{partyName(data.commercial)}</strong></div>
       <div className="quotation-info-item"><span><Warehouse size={15}/>Almacén</span><strong>{data.warehouse?.code?`${data.warehouse.code} · ${data.warehouse.name}`:data.warehouse?.name||'Sin asignar'}</strong></div>
       <div className="quotation-info-item"><span><CreditCard size={15}/>Forma de pago</span><strong>{data.payment_method?.code?`${data.payment_method.code} · ${data.payment_method.name}`:data.payment_method?.name||'Sin especificar'}</strong></div>
       <div className="quotation-info-item"><span><FileText size={15}/>Condiciones de pago</span><strong>{data.payment_term?.code?`${data.payment_term.code} · ${data.payment_term.name}`:data.payment_term?.name||'Sin especificar'}</strong></div>
       <div className="quotation-info-item"><span><CalendarDays size={15}/>Fecha</span><strong>{date(data.issue_date)}</strong></div>
       <div className="quotation-info-item"><span><Clock3 size={15}/>Validez</span><strong>{data.valid_until?date(data.valid_until):'Sin especificar'}</strong></div>
       <div className="quotation-info-item"><span><Tag size={15}/>Estado</span><strong>{statusLabel(data.status)}</strong></div>
     </div>
   </section>

   <section id="lineas" className="quotation-lines-section quotation-anchor">
     <div className="quotation-section-head"><div><h2>Líneas del presupuesto</h2><p>Artículos y condiciones económicas del presupuesto.</p></div><span className="quotation-line-count">{data.lines?.length||0} {(data.lines?.length||0)===1?'línea':'líneas'}</span></div>
     <div className="quotation-lines-layout">
       <div className="table-panel quotation-lines-table"><table><thead><tr><th>#</th><th>Artículo</th><th>Descripción</th><th>Cantidad</th><th>Precio</th><th>Dto.</th><th>IVA</th><th className="numeric">Importe</th></tr></thead><tbody>{(data.lines||[]).sort((a,b)=>a.line_no-b.line_no).map(l=><tr key={l.id}><td>{l.line_no}</td><td><strong className="quotation-product-code">{l.product?.code||'Manual'}</strong></td><td>{l.description||l.product?.commercial_description||'—'}</td><td>{Number(l.quantity).toLocaleString('es-ES')}</td><td>{money(Number(l.unit_price||0))}</td><td>{Number(l.discount_percent||0)}%</td><td>{Number(l.tax_percent||0)}%</td><td className="numeric"><strong>{money(Number(l.total_amount||0))}</strong></td></tr>)}</tbody></table></div>
       <aside className="quotation-totals-card"><div><span>Base imponible</span><strong>{money(totals.base)}</strong></div><div><span>Descuentos</span><strong>{money(totals.discount)}</strong></div><div><span>Impuestos</span><strong>{money(totals.tax)}</strong></div><div className="quotation-total-final"><span>Total</span><strong>{money(totals.total)}</strong></div></aside>
     </div>
   </section>

   {data.notes&&<section id="observaciones" className="panel quotation-notes quotation-anchor"><div className="quotation-section-head"><div><h2>Observaciones</h2><p>Información adicional del presupuesto.</p></div></div><div className="quotation-note-body"><FileText size={17}/><p>{data.notes}</p></div></section>}

   <div className="quotation-foot-meta"><div><span><Hash size={13}/>Identificador</span><strong>{data.id}</strong></div><div><span>Estado</span><strong>{statusLabel(data.status)}</strong></div><div><span>Fecha de emisión</span><strong>{date(data.issue_date)}</strong></div><div><span>Referencia</span><strong>{data.reference||'—'}</strong></div></div>
 </div>;
}
