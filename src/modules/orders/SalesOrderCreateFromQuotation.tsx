import { useEffect, useState } from 'react';
import { ArrowLeft, Check, FileText, Save } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  createSalesOrderFromQuotation,
  getQuotationForSalesOrderDraft,
  getSalesOrderByQuotationId,
  updateSalesOrder,
  type SalesOrderDraft,
} from '../../services/sales/salesOrderService';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import './sales-order.css';

const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const date=(v:string|null)=>v?new Date(`${v}T00:00:00`).toLocaleDateString('es-ES'):'—';

export function SalesOrderCreateFromQuotation(){
  const [params]=useSearchParams();
  const navigate=useNavigate();
  const quotationId=Number(params.get('quotationId'));
  const [data,setData]=useState<SalesOrderDraft|null>(null);
  const [deliveryDate,setDeliveryDate]=useState('');
  const [reference,setReference]=useState('');
  const [notes,setNotes]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    (async()=>{
      try{
        if(!quotationId) throw new CoreRepositoryError('No se ha indicado el presupuesto de origen.');
        const existing=await getSalesOrderByQuotationId(quotationId);
        if(existing){navigate(`/ventas/pedidos/${existing.id}`,{replace:true});return;}
        const draft=await getQuotationForSalesOrderDraft(quotationId);
        if(!active)return;
        setData(draft);setReference(draft.reference||'');setNotes(draft.notes||'');
      }catch(e){if(active)setError(e instanceof CoreRepositoryError?e.message:'No se pudo preparar el pedido.');}
      finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[quotationId,navigate]);

  async function save(){
    if(!data||saving)return;
    try{
      setSaving(true);setError('');
      const order=await createSalesOrderFromQuotation(data.id);
      await updateSalesOrder(order.id,{requested_delivery_date:deliveryDate||null,reference,notes});
      navigate(`/ventas/pedidos/${order.id}`,{replace:true});
    }catch(e){setError(e instanceof CoreRepositoryError?e.message:'No se pudo guardar el pedido.');}
    finally{setSaving(false);}
  }

  if(loading)return <div className="loading-block">Preparando pedido…</div>;
  if(error&&!data)return <div className="module-page"><div className="inline-error">{error}</div></div>;
  if(!data)return null;

  return <div className="module-page sales-order-page">
    <div className="sales-order-head">
      <div>
        <div className="eyebrow">VENTAS / PEDIDOS</div>
        <div className="sales-order-nav"><Link className="secondary-button" to={`/ventas/presupuestos/${data.id}`}><ArrowLeft size={15}/> Volver al presupuesto</Link><span>Presupuesto / <strong>{data.code}</strong></span></div>
        <h1>Revisar pedido</h1><p>Comprueba la información antes de crear el pedido.</p>
      </div>
      <div className="sales-order-review-badge"><Check size={15}/> Pendiente de confirmación</div>
    </div>
    {error&&<div className="inline-error">{error}</div>}

    <div className="sales-order-grid">
      <section className="sales-order-card"><div className="sales-order-card-head"><div><div className="eyebrow">CLIENTE</div><h2>{data.customer_name||'—'}</h2></div></div><div className="sales-order-detail-grid"><div><span>Contacto</span><strong>{data.contact_name||'—'}</strong></div><div><span>Email</span><strong>{data.contact_email||'—'}</strong></div><div><span>Teléfono</span><strong>{data.contact_phone||'—'}</strong></div></div></section>
      <section className="sales-order-card"><div className="sales-order-card-head"><div><div className="eyebrow">DOCUMENTO ORIGEN</div><h2>{data.code}</h2></div><Link className="icon-link" to={`/ventas/presupuestos/${data.id}`} title="Ver presupuesto"><FileText size={17}/></Link></div><div className="sales-order-detail-grid"><div><span>Fecha presupuesto</span><strong>{date(data.issue_date)}</strong></div><div><span>Medición</span><strong>{data.measurement_id?<Link to={`/gestion/mediciones/${data.measurement_id}`}>#{data.measurement_id}</Link>:'—'}</strong></div><div><span>Estado</span><strong>Aceptado</strong></div></div></section>
    </div>

    <section className="sales-order-card"><div className="sales-order-card-head"><div><div className="eyebrow">DATOS DEL PEDIDO</div><h2>Información operativa</h2></div></div><div className="sales-order-form-grid"><label><span>Fecha de entrega solicitada</span><input type="date" value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)}/></label><label><span>Referencia</span><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Referencia del cliente o del pedido"/></label><label className="full"><span>Observaciones</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="Observaciones para el pedido"/></label></div></section>

    <section className="sales-order-card"><div className="sales-order-card-head"><div><div className="eyebrow">LÍNEAS DEL PRESUPUESTO</div><h2>{data.lines.length} {data.lines.length===1?'línea':'líneas'}</h2></div></div><div className="card-table sales-order-lines"><table><thead><tr><th>#</th><th>Artículo / descripción</th><th>Cantidad</th><th>Precio</th><th>Descuento</th><th>IVA</th><th>Total</th></tr></thead><tbody>{data.lines.map((line:any)=><tr key={line.id}><td>{line.line_no}</td><td><strong>{line.description||line.product?.commercial_description||line.product?.code||'—'}</strong>{line.product?.code&&<div className="muted">{line.product.code}</div>}</td><td>{line.quantity}</td><td>{money(Number(line.unit_price||0))}</td><td>{Number(line.discount_percent||0)}%</td><td>{Number(line.tax_percent||0)}%</td><td>{money(Number(line.total_amount||0))}</td></tr>)}</tbody></table></div><div className="sales-order-totals"><div><span>Base imponible</span><strong>{money(Number(data.net_amount||0))}</strong></div><div><span>Descuentos</span><strong>{money(Number(data.discount_amount||0))}</strong></div><div><span>Impuestos</span><strong>{money(Number(data.tax_amount||0))}</strong></div><div className="grand-total"><span>Total pedido</span><strong>{money(Number(data.total_amount||0))}</strong></div></div></section>

    <div className="sales-order-footer-actions"><Link className="secondary-button" to={`/ventas/presupuestos/${data.id}`}>Cancelar</Link><button className="primary-button" type="button" onClick={()=>void save()} disabled={saving}><Save size={15}/>{saving?'Guardando…':'Guardar pedido'}</button></div>
  </div>;
}
