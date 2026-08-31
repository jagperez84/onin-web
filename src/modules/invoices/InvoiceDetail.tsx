import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban } from 'lucide-react';
import { getInvoice, cancelInvoice, type Invoice } from '../../services/sales/invoiceService';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import { confirmDialog } from '../../components/ui/ConfirmDialog';
import '../orders/sales-order.css';

const statusLabel: Record<string,string>={ISSUED:'Emitida',CANCELLED:'Cancelada'};
const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const date=(v:string|null)=>(v?new Date(`${v}T00:00:00`).toLocaleDateString('es-ES'):'—');

export function InvoiceDetail(){
 const {id}=useParams();
 const navigate=useNavigate();
 const [data,setData]=useState<Invoice|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [cancelling,setCancelling]=useState(false);

 async function load(){
  try{setLoading(true);setError('');const row=await getInvoice(Number(id));if(!row){setError('Factura no encontrada.');return;}setData(row);}
  catch(e){setError(e instanceof CoreRepositoryError?e.message:'No se pudo cargar la factura.');}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[id]);

 async function handleCancel(){
  if(!data)return;
  const ok=await confirmDialog({title:'Cancelar factura',message:`Se cancelará la factura ${data.code}. El número no se reutilizará.`,danger:true,confirmLabel:'Cancelar factura'});
  if(!ok)return;
  setCancelling(true);
  try{await cancelInvoice(data.id);await load();}
  catch(e){setError(e instanceof CoreRepositoryError?e.message:'No se pudo cancelar la factura.');}
  finally{setCancelling(false);}
 }

 if(loading)return <div className="loading-block">Cargando factura…</div>;
 if(error||!data)return <div className="module-page"><div className="inline-error">{error||'Factura no encontrada.'}</div></div>;

 const billingAddress=[data.billing_address_street,data.billing_address_city,data.billing_address_postal_code,data.billing_address_region].filter(Boolean).join(', ');

 return <div className="module-page sales-order-detail-page">
  <div className="quotation-detail-head">
   <div className="quotation-detail-title">
    <div className="quotation-detail-nav-row"><Link className="secondary-button" to="/facturacion/facturas"><ArrowLeft size={15}/> Volver a facturas</Link><span className="quotation-breadcrumb-code">Facturación / Facturas / <strong>{data.code}</strong></span></div>
    <div className="quotation-title-row"><h1>{data.code}</h1><span className={`quotation-status ${data.status.toLowerCase()}`}>{statusLabel[data.status]||data.status}</span></div>
    <div className="quotation-subtitle-meta"><span>Pedido: <Link to={`/ventas/pedidos/${data.sales_order_id}`}>{data.sales_order_code||data.sales_order_id}</Link></span></div>
   </div>
   {data.status==='ISSUED'&&<div className="quotation-actions-toolbar"><button type="button" className="danger-button" disabled={cancelling} onClick={handleCancel}><Ban size={15}/> Cancelar factura</button></div>}
  </div>

  <div className="quotation-section-grid">
   <section className="quotation-card">
    <h2>Cliente</h2>
    <p className="detail-value">{data.customer_name||'—'}</p>
    <div className="detail-grid">
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

  <section className="quotation-card">
   <h2>Plazos de cobro</h2>
   <div className="card-table"><table>
    <thead><tr><th>#</th><th>% del importe</th><th>Vencimiento</th><th>Importe</th></tr></thead>
    <tbody>
     {(data.installments||[]).map(i=><tr key={i.sequence}>
      <td>{i.sequence}</td>
      <td>{i.percentage}%</td>
      <td>{date(i.due_date)}</td>
      <td>{money(i.amount)}</td>
     </tr>)}
    </tbody>
   </table></div>
  </section>

  <div className="sales-order-totals">
   <div><span>Base imponible</span><strong>{money(data.net_amount)}</strong></div>
   <div><span>Descuentos</span><strong>{money(data.discount_amount)}</strong></div>
   <div><span>Impuestos</span><strong>{money(data.tax_amount)}</strong></div>
   <div className="grand-total"><span>Total</span><strong>{money(data.total_amount)}</strong></div>
  </div>
 </div>;
}
