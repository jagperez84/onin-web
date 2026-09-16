import { useEffect, useState } from 'react';
import { Eye, RefreshCw, Search, Scissors } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listWorkSheets, listAllWorkSheets, type WorkSheet, type WorkSheetStatus, type WorkSheetDocumentType, type AnyWorkSheetRow } from '../../services/production/workSheetService';
import { WorkSheetDetail } from './WorkSheetDetail';
import './work-sheet.css';

const statusLabel: Record<WorkSheetStatus, string> = {
  ISSUED: 'Emitida', IN_PROGRESS: 'En curso', COMPLETED: 'Completada', CANCELLED: 'Cancelada',
};

const docTypeTabs: { value: WorkSheetDocumentType; label: string }[] = [
  { value: 'PROFILE_CUT', label: 'Corte de perfil' },
  { value: 'LONA_CONFECTION', label: 'Confección de lona' },
  { value: 'COMPONENT_CONSUMPTION', label: 'Consumo de componentes' },
];

export function WorkSheetList() {
  const [docType, setDocType] = useState<WorkSheetDocumentType>('PROFILE_CUT');
  const [items, setItems] = useState<WorkSheet[]>([]);
  const [otherItems, setOtherItems] = useState<AnyWorkSheetRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WorkSheetStatus | 'ALL'>('ALL');
  const [selected, setSelected] = useState<WorkSheet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      if (docType === 'PROFILE_CUT') setItems(await listWorkSheets(search, status));
      else setOtherItems(await listAllWorkSheets(search, status, docType));
    }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudieron cargar las hojas de trabajo.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [status, docType]);

  const total = docType === 'PROFILE_CUT' ? items.length : otherItems.length;
  const completed = docType === 'PROFILE_CUT'
    ? items.filter(x => x.status === 'COMPLETED').length
    : otherItems.filter(x => x.status === 'COMPLETED').length;

  return <div className="module-page work-sheet-page">
    <div className="page-head">
      <div><div className="eyebrow">PRODUCCIÓN / TALLER</div><h1>Hojas de trabajo</h1><p>Documentos de corte, confección de lona y consumo de componentes emitidos para taller.</p></div>
      <button className="secondary-button" type="button" onClick={() => void load()}><RefreshCw size={15}/> Actualizar</button>
    </div>

    <div className="work-sheet-tabs" role="tablist" aria-label="Tipo de documento">
      {docTypeTabs.map(tab => (
        <button key={tab.value} type="button" role="tab" aria-selected={docType === tab.value}
          className={`work-sheet-tab ${docType === tab.value ? 'active' : ''}`}
          onClick={() => setDocType(tab.value)}>
          {tab.label}
        </button>
      ))}
    </div>

    <div className="work-sheet-summary">
      <div><span>Total</span><strong>{total}</strong><small>Documentos visibles</small></div>
      <div><span>Completadas</span><strong>{completed}</strong><small>Trabajos terminados</small></div>
    </div>

    <div className="toolbar">
      <div className="search-box"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void load(); }} placeholder="Buscar hoja, pedido, artículo…" aria-label="Buscar hojas de trabajo"/></div>
      <select value={status} onChange={e => setStatus(e.target.value as WorkSheetStatus | 'ALL')} aria-label="Filtrar por estado">
        <option value="ALL">Todos los estados</option><option value="COMPLETED">Completadas</option>
      </select>
      <button className="secondary-button" type="button" onClick={() => void load()}><Search size={14}/> Buscar</button>
    </div>

    {error && <div className="inline-error">{error}</div>}

    {docType === 'PROFILE_CUT' ? (
      <div className="table-panel quotation-table">
        <table><thead><tr><th>Hoja</th><th>Fecha</th><th>Pedido</th><th>Perfil</th><th>Característica</th><th>Color</th><th>Necesidad</th><th>Estado</th><th></th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={9}>Cargando hojas de trabajo…</td></tr> : items.length === 0 ? <tr><td colSpan={9}><div className="empty-state"><Scissors size={32}/><strong>No hay hojas de corte</strong><span>Cuando se confirme un corte de perfil desde un pedido, aparecerá aquí su documento para taller.</span></div></td></tr> : items.map(item => <tr key={item.id}>
            <td><strong className="work-sheet-code">{item.code}</strong><small>{item.lines.length ? `${item.lines.length} selección${item.lines.length === 1 ? '' : 'es'}` : 'Hoja de corte'}</small></td>
            <td>{new Date(item.issue_date).toLocaleDateString('es-ES')}</td>
            <td>{item.sales_order_code ? <Link className="primary-link" to={`/ventas/pedidos/${item.sales_order_id}`}>{item.sales_order_code}</Link> : '—'}</td>
            <td><strong>{item.product_code || '—'}</strong><small>{item.product_name || ''}</small></td>
            <td>{item.characteristic_name || item.characteristic_code || '—'}</td>
            <td>{item.color_name || item.color_code || '—'}</td>
            <td><strong>{item.quantity} × {item.required_length}{item.unit_symbol ? ` ${item.unit_symbol}` : ''}</strong></td>
            <td><span className={`work-sheet-status ${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span></td>
            <td><button className="secondary-button compact" type="button" onClick={() => setSelected(item)}><Eye size={14}/> Ver</button></td>
          </tr>)}</tbody>
        </table>
      </div>
    ) : (
      <div className="table-panel quotation-table">
        <table><thead><tr><th>Hoja</th><th>Fecha</th><th>Pedido</th><th>Artículo</th><th>Característica</th><th>Color</th><th>Cantidad</th><th>Estado</th><th></th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={9}>Cargando hojas de trabajo…</td></tr> : otherItems.length === 0 ? <tr><td colSpan={9}><div className="empty-state"><Scissors size={32}/><strong>No hay documentos</strong><span>Cuando se confirme {docType === 'LONA_CONFECTION' ? 'una confección de lona' : 'un consumo de componentes'} desde un pedido, aparecerá aquí su documento.</span></div></td></tr> : otherItems.map(item => <tr key={item.id}>
            <td><strong className="work-sheet-code">{item.code}</strong></td>
            <td>{new Date(item.issue_date).toLocaleDateString('es-ES')}</td>
            <td>{item.sales_order_code ? <Link className="primary-link" to={`/ventas/pedidos/${item.sales_order_id}`}>{item.sales_order_code}</Link> : '—'}</td>
            <td><strong>{item.product_code || '—'}</strong><small>{item.product_name || ''}</small></td>
            <td>{item.characteristic_name || '—'}</td>
            <td>{item.color_name || '—'}</td>
            <td><strong>{item.quantity}{item.unit_symbol ? ` ${item.unit_symbol}` : ''}</strong></td>
            <td><span className={`work-sheet-status ${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span></td>
            <td>{item.sales_order_id ? <Link className="secondary-button compact" to={`/ventas/pedidos/${item.sales_order_id}`}><Eye size={14}/> Ver pedido</Link> : null}</td>
          </tr>)}</tbody>
        </table>
      </div>
    )}

    {selected && <WorkSheetDetail id={selected.id} isModal onClose={() => setSelected(null)}/>}
  </div>;
}
