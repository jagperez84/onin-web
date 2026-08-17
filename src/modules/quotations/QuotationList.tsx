import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, RotateCcw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listQuotations, type QuotationSummary } from '../../services/sales/quotationRepository';
import './quotation.css';

function customerName(row: QuotationSummary){ return row.customer?.party?.trade_name || row.customer?.party?.legal_name || 'Sin cliente'; }
function customerLegalName(row: QuotationSummary){ const p=row.customer?.party; return p?.trade_name&&p.legal_name&&p.trade_name!==p.legal_name?p.legal_name:''; }
function commercialName(row: QuotationSummary){ return row.commercial?.party?.trade_name || row.commercial?.party?.legal_name || 'Sin asignar'; }
function statusLabel(status:string){ const labels:Record<string,string>={DRAFT:'Borrador',SENT:'Enviado',ACCEPTED:'Aceptado',REJECTED:'Rechazado',EXPIRED:'Caducado'}; return labels[status]||status; }
function statusClass(status:string){ return status.toLowerCase(); }
const money=(n:number)=>n.toLocaleString('es-ES',{style:'currency',currency:'EUR'});

export function QuotationList(){
  const [rows,setRows]=useState<QuotationSummary[]>([]); const [search,setSearch]=useState(''); const [status,setStatus]=useState('all'); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  async function load(){ setLoading(true);setError('');try{setRows(await listQuotations(search));}catch(e){setError(e instanceof Error?e.message:'No se pudieron cargar los presupuestos.');}finally{setLoading(false);} }
  useEffect(()=>{const t=setTimeout(()=>void load(),250);return()=>clearTimeout(t)},[search]);
  const visibleRows=useMemo(()=>status==='all'?rows:rows.filter(r=>r.status===status),[rows,status]);
  const total=useMemo(()=>visibleRows.reduce((sum,row)=>sum+Number(row.total_amount||0),0),[visibleRows]);
  return <div className="module-page quotation-page"><div className="page-head"><div><div className="eyebrow">VENTAS / PRESUPUESTOS</div><h1>Presupuestos</h1><p>Consulta, seguimiento y gestión de tus presupuestos comerciales.</p></div><div className="quotation-head-actions"><button className="secondary-button" type="button" onClick={()=>void load()}><RotateCcw size={15}/>Actualizar</button><Link className="primary-button" to="/ventas/presupuestos/nuevo"><Plus size={16}/>Nuevo presupuesto</Link></div></div>
    <div className="quotation-list-summary"><div className="quotation-summary-card"><div><span>Presupuestos visibles</span><strong>{visibleRows.length}</strong><small>Según búsqueda y estado</small></div></div><div className="quotation-summary-card accent"><div><span>Importe visible</span><strong>{money(total)}</strong><small>Suma de los presupuestos mostrados</small></div></div><div className="quotation-summary-card"><div><span>Estado seleccionado</span><strong>{status==='all'?'Todos':statusLabel(status)}</strong><small>Filtra para revisar una etapa concreta</small></div></div></div>
    <div className="toolbar"><div className="search-box"><Search size={17}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por número o referencia…" aria-label="Buscar presupuesto"/></div><select value={status} onChange={e=>setStatus(e.target.value)} aria-label="Estado"><option value="all">Todos los estados</option><option value="DRAFT">Borradores</option><option value="SENT">Enviados</option><option value="ACCEPTED">Aceptados</option><option value="REJECTED">Rechazados</option><option value="EXPIRED">Caducados</option></select><span className="result-count">{visibleRows.length} presupuestos</span></div>
    {error&&<div className="inline-error">{error}</div>}
    <div className="table-panel quotation-table"><table><thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Comercial</th><th>Estado</th><th className="numeric">Importe</th></tr></thead><tbody>
      {loading?<tr><td colSpan={6}>Cargando…</td></tr>:visibleRows.length===0?<tr><td colSpan={6}><div className="empty-state"><FileText size={28}/><strong>No hay presupuestos</strong><span>Prueba otra búsqueda o cambia el filtro de estado.</span></div></td></tr>:visibleRows.map(r=><tr key={r.id} className="clickable-row"><td><div className="quotation-number"><Link className="primary-link" to={`/ventas/presupuestos/${r.id}`}>{r.code}</Link><small>Presupuesto {r.id}</small></div></td><td>{new Date(`${r.issue_date}T00:00:00`).toLocaleDateString('es-ES')}</td><td><div className="quotation-customer"><strong>{customerName(r)}</strong>{customerLegalName(r)&&<span>{customerLegalName(r)}</span>}</div></td><td>{commercialName(r)}</td><td><span className={`quotation-status ${statusClass(r.status)}`}>{statusLabel(r.status)}</span></td><td className="numeric"><strong>{money(Number(r.total_amount||0))}</strong></td></tr>)}</tbody></table></div>
  </div>;
}
