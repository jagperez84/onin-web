import { useEffect, useState } from 'react';
import { Eye, FileText, RefreshCw, Search, Scissors } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listWorkSheets, type WorkSheet, type WorkSheetStatus } from '../../services/production/workSheetService';
import { WorkSheetDetail } from './WorkSheetDetail';
import './work-sheet.css';

const statusLabel: Record<WorkSheetStatus, string> = {
  ISSUED: 'Emitida', IN_PROGRESS: 'En curso', COMPLETED: 'Completada', CANCELLED: 'Cancelada',
};

export function WorkSheetList() {
  const [items, setItems] = useState<WorkSheet[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WorkSheetStatus | 'ALL'>('ALL');
  const [selected, setSelected] = useState<WorkSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try { setItems(await listWorkSheets(search, status)); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar las hojas de trabajo.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [status]);

  return <div className="module-page work-sheet-page">
    <div className="page-head">
      <div><div className="eyebrow">PRODUCCIÓN / TALLER</div><h1>Hojas de trabajo</h1><p>Documentos de corte emitidos para taller con la selección de material utilizada.</p></div>
      <button className="secondary-button" type="button" onClick={() => void load()}><RefreshCw size={15}/> Actualizar</button>
    </div>

    <div className="work-sheet-summary">
      <div><span>Total</span><strong>{items.length}</strong><small>Documentos visibles</small></div>
      <div><span>Emitidas</span><strong>{items.filter(x => x.status === 'ISSUED').length}</strong><small>Pendientes de taller</small></div>
      <div><span>Completadas</span><strong>{items.filter(x => x.status === 'COMPLETED').length}</strong><small>Trabajos terminados</small></div>
    </div>

    <div className="toolbar">
      <div className="search-box"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void load(); }} placeholder="Buscar hoja, pedido, perfil..." aria-label="Buscar hojas de trabajo"/></div>
      <select value={status} onChange={e => setStatus(e.target.value as WorkSheetStatus | 'ALL')} aria-label="Filtrar por estado">
        <option value="ALL">Todos los estados</option><option value="ISSUED">Emitidas</option><option value="IN_PROGRESS">En curso</option><option value="COMPLETED">Completadas</option><option value="CANCELLED">Canceladas</option>
      </select>
      <button className="secondary-button" type="button" onClick={() => void load()}><Search size={14}/> Buscar</button>
    </div>

    {error && <div className="inline-error">{error}</div>}
    <div className="table-panel quotation-table">
      <table><thead><tr><th>Hoja</th><th>Fecha</th><th>Pedido</th><th>Perfil</th><th>Característica</th><th>Necesidad</th><th>Estado</th><th></th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={8}>Cargando hojas de trabajo…</td></tr> : items.length === 0 ? <tr><td colSpan={8}><div className="empty-state"><Scissors size={32}/><strong>No hay hojas de corte</strong><span>Cuando se confirme un corte de perfil desde un pedido, aparecerá aquí su documento para taller.</span></div></td></tr> : items.map(item => <tr key={item.id}>
          <td><strong className="work-sheet-code">{item.code}</strong><small>{item.lines.length ? `${item.lines.length} selección${item.lines.length === 1 ? '' : 'es'}` : 'Hoja de corte'}</small></td>
          <td>{new Date(item.issue_date).toLocaleDateString('es-ES')}</td>
          <td>{item.sales_order_code ? <Link className="primary-link" to={`/ventas/pedidos/${item.sales_order_id}`}>{item.sales_order_code}</Link> : '—'}</td>
          <td><strong>{item.product_code || '—'}</strong><small>{item.product_name || ''}</small></td>
          <td>{item.characteristic_name || item.characteristic_code || '—'}</td>
          <td><strong>{item.quantity} × {item.required_length}{item.unit_symbol ? ` ${item.unit_symbol}` : ''}</strong></td>
          <td><span className={`work-sheet-status ${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span></td>
          <td><button className="secondary-button compact" type="button" onClick={() => setSelected(item)}><Eye size={14}/> Ver</button></td>
        </tr>)}</tbody>
      </table>
    </div>

    {selected && <WorkSheetDetail id={selected.id} isModal onClose={() => setSelected(null)}/>} 
  </div>;
}
