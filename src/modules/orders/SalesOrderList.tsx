import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Eye, ClipboardList } from 'lucide-react';
import { listSalesOrders, type SalesOrder } from '../../services/sales/salesOrderService';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import './sales-order.css';

const statusLabel: Record<string,string>={PENDING_MANUFACTURING:'Pendiente de fabricación',PREPARED:'Preparado',CONFECTIONED:'Confeccionado',MANUFACTURED:'Fabricado',INSTALLED:'Instalado',CANCELLED:'Cancelado'};
const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'});
const date=(v:string)=>new Date(`${v}T00:00:00`).toLocaleDateString('es-ES');

export function SalesOrderList(){
 const [rows,setRows]=useState<SalesOrder[]>([]); const [search,setSearch]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 async function load(){try{setLoading(true);setError('');setRows(await listSalesOrders(search));}catch(e){setError(e instanceof CoreRepositoryError?e.message:'No se pudieron cargar los pedidos.');}finally{setLoading(false);}}
 useEffect(()=>{const t=setTimeout(()=>void load(),200);return()=>clearTimeout(t);},[search]);
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
   <span className="sales-order-count">{rows.length} {rows.length===1?'pedido':'pedidos'}</span>
  </div>
  {error&&<div className="inline-error">{error}</div>}
  <div className="sales-order-table-card">
   <div className="sales-order-table-wrap"><table>
    <thead><tr><th>Pedido</th><th>Presupuesto</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th className="numeric">Total</th><th></th></tr></thead>
    <tbody>
     {loading?<tr><td colSpan={7} className="sales-order-empty">Cargando pedidos…</td></tr>:rows.length===0?<tr><td colSpan={7} className="sales-order-empty">No hay pedidos.</td></tr>:rows.map(r=><tr key={r.id}>
      <td><Link className="sales-order-code" to={`/ventas/pedidos/${r.id}`}>{r.code}</Link></td>
      <td><Link className="sales-order-document-link" to={`/ventas/presupuestos/${r.quotation_id}`}>{r.quotation_code||r.quotation_id}</Link></td>
      <td><strong>{r.customer_name||'—'}</strong></td>
      <td>{date(r.issue_date)}</td>
      <td><span className={`status-pill ${r.status.toLowerCase()}`}>{statusLabel[r.status]||r.status}</span></td>
      <td className="numeric sales-order-list-total">{money(Number(r.total_amount||0))}</td>
      <td className="sales-order-list-action"><Link className="icon-link" title="Ver pedido" to={`/ventas/pedidos/${r.id}`}><Eye size={16}/></Link></td>
     </tr>)}
    </tbody>
   </table></div>
  </div>
 </div>;
}
