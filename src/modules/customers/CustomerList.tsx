import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Users } from 'lucide-react';
import { listCustomers } from '../../services/core/customerRepository';
import type { CustomerSummary } from '../../domain/core/types';

export function CustomerList(){
  const [rows,setRows]=useState<CustomerSummary[]>([]); const [search,setSearch]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  async function load(){setLoading(true);setError('');try{setRows(await listCustomers(search));}catch(e){setError(e instanceof Error?e.message:'No se pudieron cargar los clientes.');}finally{setLoading(false)}}
  useEffect(()=>{const t=setTimeout(load,250);return()=>clearTimeout(t)},[search]);
  return <div className="module-page"><div className="page-head"><div><div className="eyebrow">VENTAS / CLIENTES</div><h1>Listado de Clientes</h1><p>Consulta y gestión de clientes.</p></div><Link className="primary-button" to="/ventas/clientes/nuevo"><Plus size={17}/> Nuevo cliente</Link></div>
    <div className="toolbar"><div className="search-box"><Search size={17}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por nombre, CIF/NIF o código…" aria-label="Buscar cliente"/></div><span className="result-count">{rows.length} clientes</span></div>
    {error&&<div className="inline-error">{error}</div>}
    <div className="table-panel"><table><thead><tr><th>ID</th><th>Cliente</th><th>CIF/NIF</th><th>Localidad</th><th>Teléfono</th><th>Email</th><th>Estado</th></tr></thead><tbody>
      {loading?<tr><td colSpan={7}>Cargando…</td></tr>:rows.length===0?<tr><td colSpan={7}><div className="empty-state"><Users size={28}/><strong>No hay clientes</strong><span>Prueba con otra búsqueda o crea un nuevo cliente.</span></div></td></tr>:rows.map(r=><tr key={r.id} className="clickable-row"><td><Link to={`/ventas/clientes/${r.id}`}>{r.id}</Link></td><td><Link className="primary-link" to={`/ventas/clientes/${r.id}`}>{r.party.trade_name||r.party.legal_name}</Link>{r.party.trade_name&&<div className="secondary">{r.party.legal_name}</div>}</td><td>{r.party.tax_id||'—'}</td><td>—</td><td>{r.party.phone||'—'}</td><td>{r.party.email||'—'}</td><td><span className={`status ${r.party.active?'active':'inactive'}`}>{r.party.active?'Activo':'Inactivo'}</span></td></tr>)}</tbody></table></div>
  </div>
}
