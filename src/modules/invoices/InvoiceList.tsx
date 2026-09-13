import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Search, Eye, Receipt } from 'lucide-react';
import { listInvoices, type Invoice, type InvoiceSortField } from '../../services/sales/invoiceService';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import '../orders/sales-order.css';

const statusLabel: Record<string,string>={ISSUED:'Emitida',RECTIFIED:'Rectificada'};
const statusTone: Record<string,string>={ISSUED:'success',RECTIFIED:''};
const typeLabel: Record<string,string>={ORIGINAL:'',RECTIFICATIVA:'Rectificativa'};
const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const date=(v:string)=>new Date(`${v}T00:00:00`).toLocaleDateString('es-ES');

export function InvoiceList(){
 const [rows,setRows]=useState<Invoice[]>([]); const [search,setSearch]=useState(''); const [sortBy,setSortBy]=useState<InvoiceSortField>('issue_date'); const [ascending,setAscending]=useState(false); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 async function load(){try{setLoading(true);setError('');setRows(await listInvoices(search,sortBy,ascending));}catch(e){setError(e instanceof CoreRepositoryError?e.message:'No se pudieron cargar las facturas.');}finally{setLoading(false);}}
 useEffect(()=>{const t=setTimeout(()=>void load(),200);return()=>clearTimeout(t);},[search,sortBy,ascending]);
 return <div className="module-page sales-order-page">
  <div className="sales-order-head">
   <div>
    <div className="eyebrow">FACTURACIÓN / FACTURAS</div>
    <div className="sales-order-title-row"><h1>Facturas</h1><span className="sales-order-review-badge"><Receipt size={14}/> Facturación de pedidos</span></div>
    <p>Facturas generadas a partir de pedidos fabricados.</p>
   </div>
  </div>
  <div className="sales-order-toolbar">
   <div className="search-box sales-order-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por factura o referencia…"/></div>
   <div className="sales-order-sort">
    <label htmlFor="invoice-sort-field">Ordenar por</label>
    <select id="invoice-sort-field" value={sortBy} onChange={e=>setSortBy(e.target.value as InvoiceSortField)}>
     <option value="issue_date">Fecha de emisión</option>
     <option value="total_amount">Importe</option>
    </select>
    <button type="button" className="icon-link" onClick={()=>setAscending(a=>!a)} title={ascending?'Orden ascendente':'Orden descendente'} aria-label={ascending?'Orden ascendente':'Orden descendente'}>
     {ascending?<ArrowUp size={16}/>:<ArrowDown size={16}/>}
    </button>
   </div>
   <span className="sales-order-count">{rows.length} {rows.length===1?'factura':'facturas'}</span>
  </div>
  {error&&<div className="inline-error">{error}</div>}
  <div className="table-panel sales-order-table-card">
   <table>
    <thead><tr><th>Factura</th><th>Pedido</th><th>Referencia</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th className="numeric">Total</th><th></th></tr></thead>
    <tbody>
     {loading?<tr><td colSpan={8} className="sales-order-empty">Cargando facturas…</td></tr>:rows.length===0?<tr><td colSpan={8} className="sales-order-empty">No hay facturas.</td></tr>:rows.map(r=><tr key={r.id}>
      <td><Link className="sales-order-code" to={`/facturacion/facturas/${r.id}`}>{r.code}</Link>{typeLabel[r.invoice_type]&&<span className="status-pill neutral" style={{marginLeft:'6px'}}>{typeLabel[r.invoice_type]}</span>}</td>
      <td><Link className="sales-order-document-link" to={`/ventas/pedidos/${r.sales_order_id}`}>{r.sales_order_code||r.sales_order_id}</Link></td>
      <td>{r.reference||'—'}</td>
      <td><strong>{r.customer_name||'—'}</strong></td>
      <td>{date(r.issue_date)}</td>
      <td><span className={`status-pill ${statusTone[r.status]||''}`}>{statusLabel[r.status]||r.status}</span></td>
      <td className="numeric sales-order-list-total">{money(Number(r.total_amount||0))}</td>
      <td className="sales-order-list-action"><Link className="icon-link" title="Ver factura" to={`/facturacion/facturas/${r.id}`}><Eye size={16}/></Link></td>
     </tr>)}
    </tbody>
   </table>
  </div>
 </div>;
}
