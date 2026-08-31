import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Eye, ClipboardList, ArrowUp, ArrowDown } from 'lucide-react';
import { listSalesOrders, type SalesOrder, type SalesOrderSortField } from '../../services/sales/salesOrderService';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import './sales-order.css';

const statusLabel: Record<string,string>={PENDING_MANUFACTURING:'Pendiente de fabricación',PREPARED:'Preparado',FABRICATING:'Fabricando',CONFECTIONED:'Confeccionado',MANUFACTURED:'Fabricado',INSTALLATION_SCHEDULED:'Montaje programado',INSTALLED:'Instalado',CANCELLED:'Cancelado'};
const statusTone: Record<string,string>={PENDING_MANUFACTURING:'warning',PREPARED:'',FABRICATING:'',CONFECTIONED:'',MANUFACTURED:'success',INSTALLATION_SCHEDULED:'',INSTALLED:'success',CANCELLED:'danger'};
const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const date=(v:string)=>new Date(`${v}T00:00:00`).toLocaleDateString('es-ES');

function deliveryUrgency(r: SalesOrder): 'overdue'|'soon'|null {
 if(!r.requested_delivery_date||r.status==='INSTALLED'||r.status==='CANCELLED') return null;
 const today=new Date(); today.setHours(0,0,0,0);
 const due=new Date(`${r.requested_delivery_date}T00:00:00`);
 const diffDays=Math.floor((due.getTime()-today.getTime())/86400000);
 if(diffDays<0) return 'overdue';
 if(diffDays<=3) return 'soon';
 return null;
}

export function SalesOrderList(){
 const [rows,setRows]=useState<SalesOrder[]>([]); const [search,setSearch]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 const [sortBy,setSortBy]=useState<SalesOrderSortField>('created_at'); const [ascending,setAscending]=useState(false);
 async function load(){try{setLoading(true);setError('');setRows(await listSalesOrders(search,sortBy,ascending));}catch(e){setError(e instanceof CoreRepositoryError?e.message:'No se pudieron cargar los pedidos.');}finally{setLoading(false);}}
 useEffect(()=>{const t=setTimeout(()=>void load(),200);return()=>clearTimeout(t);},[search,sortBy,ascending]);
 return <div className="module-page sales-order-page">
  <div className="sales-order-head">
   <div>
    <div className="eyebrow">VENTAS / PEDIDOS</div>
    <div className="sales-order-title-row"><h1>Pedidos</h1><span className="sales-order-review-badge"><ClipboardList size={14}/> Gestión de pedidos</span></div>
    <p>Pedidos generados desde presupuestos aceptados.</p>
   </div>
  </div>
  <div className="sales-order-toolbar">
   <div className="search-box sales-order-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por pedido o referencia…"/></div>
   <div className="sales-order-sort">
    <label htmlFor="sales-order-sort-field">Ordenar por</label>
    <select id="sales-order-sort-field" value={sortBy} onChange={e=>setSortBy(e.target.value as SalesOrderSortField)}>
     <option value="created_at">Fecha de creación</option>
     <option value="requested_delivery_date">Fecha de entrega solicitada</option>
    </select>
    <button type="button" className="icon-link" onClick={()=>setAscending(a=>!a)} title={ascending?'Orden ascendente':'Orden descendente'} aria-label={ascending?'Orden ascendente':'Orden descendente'}>
     {ascending?<ArrowUp size={16}/>:<ArrowDown size={16}/>}
    </button>
   </div>
   <span className="sales-order-count">{rows.length} {rows.length===1?'pedido':'pedidos'}</span>
  </div>
  {error&&<div className="inline-error">{error}</div>}
  <div className="sales-order-table-card">
   <div className="sales-order-table-wrap"><table>
    <thead><tr><th>Pedido</th><th>Presupuesto</th><th>Referencia</th><th>Cliente</th><th>Fecha</th><th>Entrega solicitada</th><th>Estado</th><th className="numeric">Total</th><th></th></tr></thead>
    <tbody>
     {loading?<tr><td colSpan={9} className="sales-order-empty">Cargando pedidos…</td></tr>:rows.length===0?<tr><td colSpan={9} className="sales-order-empty">No hay pedidos.</td></tr>:rows.map(r=>{
      const urgency=deliveryUrgency(r);
      return <tr key={r.id} className={urgency?`sales-order-row-${urgency}`:''}>
      <td><Link className="sales-order-code" to={`/ventas/pedidos/${r.id}`}>{r.code}</Link></td>
      <td><Link className="sales-order-document-link" to={`/ventas/presupuestos/${r.quotation_id}`}>{r.quotation_code||r.quotation_id}</Link></td>
      <td>{r.reference||'—'}</td>
      <td><strong>{r.customer_name||'—'}</strong></td>
      <td>{date(r.issue_date)}</td>
      <td className={urgency?`sales-order-delivery-date ${urgency}`:'sales-order-delivery-date'}>{r.requested_delivery_date?date(r.requested_delivery_date):'—'}</td>
      <td><span className={`status-pill ${statusTone[r.status]||''}`}>{statusLabel[r.status]||r.status}</span></td>
      <td className="numeric sales-order-list-total">{money(Number(r.total_amount||0))}</td>
      <td className="sales-order-list-action"><Link className="icon-link" title="Ver pedido" to={`/ventas/pedidos/${r.id}`}><Eye size={16}/></Link></td>
     </tr>;})}
    </tbody>
   </table></div>
  </div>
 </div>;
}
