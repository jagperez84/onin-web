import { useEffect, useState } from 'react';
import { FileText, Plus, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listQuotations, type QuotationSummary } from '../../services/sales/quotationRepository';

function customerName(row: QuotationSummary){ return row.customer?.party?.trade_name || row.customer?.party?.legal_name || '—'; }
function commercialName(row: QuotationSummary){ return row.commercial?.party?.trade_name || row.commercial?.party?.legal_name || '—'; }
function statusLabel(status:string){ const labels:Record<string,string>={DRAFT:'Borrador',SENT:'Enviado',ACCEPTED:'Aceptado',REJECTED:'Rechazado',EXPIRED:'Caducado'}; return labels[status]||status; }

export function QuotationList(){
  const [rows,setRows]=useState<QuotationSummary[]>([]); const [search,setSearch]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  async function load(){ setLoading(true);setError('');try{setRows(await listQuotations(search));}catch(e){setError(e instanceof Error?e.message:'No se pudieron cargar los presupuestos.');}finally{setLoading(false);} }
  useEffect(()=>{const t=setTimeout(()=>void load(),250);return()=>clearTimeout(t)},[search]);
  return <div className="module-page"><div className="page-head"><div><div className="eyebrow">VENTAS / PRESUPUESTOS</div><h1>Listado de Presupuestos</h1><p>Consulta y gestión de presupuestos.</p></div><Link className="button primary" to="/ventas/presupuestos/nuevo"><Plus size={16}/>Nuevo presupuesto</Link></div>
    <div className="toolbar"><div className="search-box"><Search size={17}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por número o referencia…" aria-label="Buscar presupuesto"/></div><span className="result-count">{rows.length} presupuestos</span></div>
    {error&&<div className="inline-error">{error}</div>}
    <div className="table-panel"><table><thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Comercial</th><th>Estado</th><th className="numeric">Importe</th></tr></thead><tbody>
      {loading?<tr><td colSpan={6}>Cargando…</td></tr>:rows.length===0?<tr><td colSpan={6}><div className="empty-state"><FileText size={28}/><strong>No hay presupuestos</strong><span>Los presupuestos aparecerán aquí cuando existan.</span></div></td></tr>:rows.map(r=><tr key={r.id} className="clickable-row"><td><Link className="primary-link" to={`/ventas/presupuestos/${r.id}`}>{r.code}</Link></td><td>{new Date(`${r.issue_date}T00:00:00`).toLocaleDateString('es-ES')}</td><td>{customerName(r)}</td><td>{commercialName(r)}</td><td><span className={`status ${r.status==='ACCEPTED'?'active':r.status==='REJECTED'||r.status==='EXPIRED'?'inactive':''}`}>{statusLabel(r.status)}</span></td><td className="numeric">{Number(r.total_amount||0).toLocaleString('es-ES',{style:'currency',currency:'EUR'})}</td></tr>)}</tbody></table></div>
  </div>;
}
