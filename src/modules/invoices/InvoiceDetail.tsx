import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileWarning, ShieldCheck, X } from 'lucide-react';
import { getInvoice, createRectifyingInvoice, type Invoice } from '../../services/sales/invoiceService';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import '../orders/sales-order.css';

const statusLabel: Record<string,string>={ISSUED:'Emitida',RECTIFIED:'Rectificada'};
const verifactuLabel: Record<string,string>={NOT_SENT:'Sin enviar',PENDING:'Pendiente de envío',SENT:'Enviada a la AEAT',ERROR:'Error de envío'};
const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const date=(v:string|null)=>(v?new Date(`${v}T00:00:00`).toLocaleDateString('es-ES'):'—');

function RectifyModal({invoice,onClose,onDone}:{invoice:Invoice;onClose:()=>void;onDone:(rectifying:Invoice)=>void}){
 const [reason,setReason]=useState('');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');

 async function submit(){
  if(!reason.trim()){setError('Indica el motivo de la rectificación.');return;}
  setSaving(true);setError('');
  try{const rectifying=await createRectifyingInvoice(invoice.id,reason.trim());onDone(rectifying);}
  catch(e){setError(e instanceof CoreRepositoryError?e.message:'No se pudo generar la factura rectificativa.');}
  finally{setSaving(false);}
 }

 return <div className="modal-backdrop" onClick={onClose}>
  <div className="modal-card sm" onClick={e=>e.stopPropagation()}>
   <div className="modal-header">
    <div className="modal-title-wrap">
     <span className="modal-icon-badge danger"><FileWarning size={18}/></span>
     <div><h3>Rectificar factura {invoice.code}</h3><p>Se generará una nueva factura rectificativa (serie FRA-R) con los importes en negativo, enlazada a esta. La factura original no se borra, queda marcada como rectificada.</p></div>
    </div>
    <button type="button" className="close-btn" onClick={onClose} aria-label="Cerrar"><X size={18}/></button>
   </div>
   <div className="modal-body">
    {error&&<div className="inline-error">{error}</div>}
    <div className="form-group">
     <label>Motivo de la rectificación<span className="required">*</span></label>
     <textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Error en el importe, devolución, corrección de datos del cliente…" autoFocus/>
    </div>
   </div>
   <div className="modal-actions-footer">
    <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
    <button type="button" className="danger-button" disabled={saving} onClick={submit}>{saving?'Generando…':'Generar rectificativa'}</button>
   </div>
  </div>
 </div>;
}

export function InvoiceDetail(){
 const {id}=useParams();
 const [data,setData]=useState<Invoice|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [rectifyOpen,setRectifyOpen]=useState(false);

 async function load(){
  try{setLoading(true);setError('');const row=await getInvoice(Number(id));if(!row){setError('Factura no encontrada.');return;}setData(row);}
  catch(e){setError(e instanceof CoreRepositoryError?e.message:'No se pudo cargar la factura.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[id]);

 if(loading)return <div className="loading-block">Cargando factura…</div>;
 if(error||!data)return <div className="module-page"><div className="inline-error">{error||'Factura no encontrada.'}</div></div>;

 const billingAddress=[data.billing_address_street,data.billing_address_city,data.billing_address_postal_code,data.billing_address_region].filter(Boolean).join(', ');

 return <div className="module-page sales-order-detail-page">
  <div className="quotation-detail-head">
   <div className="quotation-detail-title">
    <div className="quotation-detail-nav-row"><Link className="secondary-button" to="/facturacion/facturas"><ArrowLeft size={15}/> Volver a facturas</Link><span className="quotation-breadcrumb-code">Facturación / Facturas / <strong>{data.code}</strong></span></div>
    <div className="quotation-title-row"><h1>{data.code}</h1><span className={`quotation-status ${data.status.toLowerCase()}`}>{statusLabel[data.status]||data.status}</span>{data.invoice_type==='RECTIFICATIVA'&&<span className="status-pill neutral">Rectificativa</span>}</div>
    <div className="quotation-subtitle-meta">
     <span>Pedido: <Link to={`/ventas/pedidos/${data.sales_order_id}`}>{data.sales_order_code||data.sales_order_id}</Link></span>
     {data.rectifies_invoice_id&&<><span className="dot-sep">·</span><span>Rectifica a: <Link to={`/facturacion/facturas/${data.rectifies_invoice_id}`}>factura original</Link></span></>}
     {data.rectified_by_invoice_id&&<><span className="dot-sep">·</span><span>Rectificada por: <Link to={`/facturacion/facturas/${data.rectified_by_invoice_id}`}>ver rectificativa</Link></span></>}
    </div>
   </div>
   {data.status==='ISSUED'&&<div className="quotation-actions-toolbar"><button type="button" className="danger-button" onClick={()=>setRectifyOpen(true)}><FileWarning size={15}/> Rectificar factura</button></div>}
  </div>

  {data.rectification_reason&&<div className="inline-error" style={{background:'var(--canvas-stripe)',color:'var(--text)'}}>Motivo de la rectificación: {data.rectification_reason}</div>}

  <div className="quotation-section-grid">
   <section className="quotation-card">
    <h2>Emisor</h2>
    <p className="detail-value">{data.issuer_legal_name||'—'}</p>
    <div className="detail-grid">
     <div><span>NIF</span><strong>{data.issuer_tax_id||'—'}</strong></div>
     <div><span>Domicilio fiscal</span><strong>{data.issuer_address||'—'}</strong></div>
    </div>
   </section>
   <section className="quotation-card">
    <h2>Cliente</h2>
    <p className="detail-value">{data.customer_name||'—'}</p>
    <div className="detail-grid">
     <div><span>NIF</span><strong>{data.customer_tax_id||'—'}</strong></div>
     <div><span>Dirección de facturación</span><strong>{billingAddress||'—'}</strong></div>
    </div>
   </section>
   <section className="quotation-card">
    <h2>Datos de la factura</h2>
    <div className="detail-grid">
     <div><span>Fecha de emisión</span><strong>{date(data.issue_date)}</strong></div>
     <div><span>Referencia</span><strong>{data.reference||'—'}</strong></div>
     <div><span>Forma de pago</span><strong>{data.payment_method_name||'—'}</strong></div>
     <div><span>Condiciones de pago</span><strong>{data.payment_term_name||'—'}</strong></div>
    </div>
   </section>
  </div>

  <section className="quotation-card">
   <h2>Líneas</h2>
   <div className="card-table"><table>
    <thead><tr><th>#</th><th>Descripción</th><th>Cantidad</th><th>Precio</th><th>Dto.%</th><th>IVA%</th><th>Total</th></tr></thead>
    <tbody>
     {(data.lines||[]).map(l=><tr key={l.id}>
      <td>{l.line_no}</td>
      <td>{l.description}</td>
      <td>{l.quantity}</td>
      <td>{money(l.unit_price)}</td>
      <td>{l.discount_percent}%</td>
      <td>{l.tax_percent}%</td>
      <td>{money(l.total_amount)}</td>
     </tr>)}
    </tbody>
   </table></div>
  </section>

  <div className="quotation-section-grid">
   <section className="quotation-card">
    <h2>Desglose de IVA</h2>
    <div className="card-table"><table>
     <thead><tr><th>Tipo</th><th>Base imponible</th><th>Cuota</th></tr></thead>
     <tbody>
      {(data.tax_breakdown||[]).map(tb=><tr key={tb.tax_percent}>
       <td>{tb.tax_percent}%</td>
       <td>{money(tb.base_amount)}</td>
       <td>{money(tb.tax_amount)}</td>
      </tr>)}
     </tbody>
    </table></div>
   </section>
   <section className="quotation-card">
    <h2>Plazos de cobro</h2>
    <div className="card-table"><table>
     <thead><tr><th>#</th><th>% del importe</th><th>Vencimiento</th><th>Importe</th><th>Estado</th></tr></thead>
     <tbody>
      {(data.installments||[]).map(i=><tr key={i.sequence}>
       <td>{i.sequence}</td>
       <td>{i.percentage}%</td>
       <td>{date(i.due_date)}</td>
       <td>{money(i.amount)}</td>
       <td><span className={`status-pill ${i.status==='COLLECTED'?'success':''}`}>{i.status==='COLLECTED'?'Cobrado':'Pendiente'}</span></td>
      </tr>)}
     </tbody>
    </table></div>
    <p style={{marginTop:'10px'}}><Link to="/facturacion/cobros" className="secondary-button">Gestionar cobros</Link></p>
   </section>
  </div>

  <section className="quotation-card">
   <h2><ShieldCheck size={16} style={{verticalAlign:'-3px',marginRight:'6px'}}/>Integridad y Veri*Factu</h2>
   <div className="detail-grid">
    <div><span>Posición en la cadena</span><strong>#{data.chain_sequence ?? '—'}</strong></div>
    <div><span>Huella ({data.hash_algorithm})</span><strong style={{fontFamily:'monospace',fontSize:'11px',wordBreak:'break-all'}}>{data.record_hash||'—'}</strong></div>
    <div><span>Envío a la AEAT</span><strong>{verifactuLabel[data.verifactu_status]||data.verifactu_status}</strong></div>
   </div>
  </section>

  <div className="sales-order-totals">
   <div><span>Base imponible</span><strong>{money(data.net_amount)}</strong></div>
   <div><span>Descuentos</span><strong>{money(data.discount_amount)}</strong></div>
   <div><span>Impuestos</span><strong>{money(data.tax_amount)}</strong></div>
   <div className="grand-total"><span>Total</span><strong>{money(data.total_amount)}</strong></div>
  </div>

  {rectifyOpen&&<RectifyModal invoice={data} onClose={()=>setRectifyOpen(false)} onDone={()=>{setRectifyOpen(false);void load();}}/>}
 </div>;
}
