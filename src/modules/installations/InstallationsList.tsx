import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, Search } from 'lucide-react';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import {
  listInstallations,
  listInstallers,
  resolveCurrentCompanyId,
  type Installation,
  type InstallationStatus,
  type Installer,
} from '../../services/production/installationService';
import '../orders/sales-order.css';
import '../orders/installation.css';

const statusLabel: Record<InstallationStatus, string> = { SCHEDULED: 'Programada', COMPLETED: 'Completada', CANCELLED: 'Cancelada' };
const fmtDate = (v: string | null) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString('es-ES') : '—');
const todayStr = () => new Date().toISOString().slice(0, 10);

export function InstallationsList() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [rows, setRows] = useState<Installation[]>([]);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [status, setStatus] = useState<InstallationStatus | 'ALL'>('SCHEDULED');
  const [installerId, setInstallerId] = useState<number | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    resolveCurrentCompanyId()
      .then(id => {
        if (active) setCompanyId(id);
      })
      .catch(e => {
        if (active) setError(e instanceof Error ? e.message : 'No se pudo determinar la empresa.');
      });
    return () => {
      active = false;
    };
  }, []);

  async function load(id: number) {
    try {
      setLoading(true);
      setError('');
      const [installationsResult, installersResult] = await Promise.all([listInstallations({ companyId: id, status, search }), listInstallers(id)]);
      setRows(installationsResult);
      setInstallers(installersResult);
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : 'No se pudieron cargar los montajes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (companyId == null) return;
    const t = setTimeout(() => void load(companyId), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, status, search]);

  const today = todayStr();
  const filteredRows = useMemo(
    () => (installerId === 'ALL' ? rows : rows.filter(r => r.installers.some(i => i.id === installerId))),
    [rows, installerId]
  );
  const overdueCount = filteredRows.filter(r => r.status === 'SCHEDULED' && r.scheduledDate && r.scheduledDate < today).length;

  return (
    <div className="module-page sales-order-page">
      <div className="sales-order-head">
        <div>
          <div className="eyebrow">GESTIÓN / MONTAJES</div>
          <div className="sales-order-title-row">
            <h1>Montajes</h1>
            <span className="sales-order-review-badge">
              <CalendarClock size={14} /> Programación de instalaciones
            </span>
          </div>
          <p>Visitas de instalación programadas para pedidos ya fabricados.</p>
        </div>
      </div>

      <div className="sales-order-toolbar">
        <div className="search-box sales-order-search">
          <Search size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por pedido o cliente…" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value as InstallationStatus | 'ALL')}>
          <option value="SCHEDULED">Programadas</option>
          <option value="COMPLETED">Completadas</option>
          <option value="ALL">Todas</option>
        </select>
        <select value={installerId} onChange={e => setInstallerId(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}>
          <option value="ALL">Todos los instaladores</option>
          {installers.map(i => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <span className="sales-order-count">
          {filteredRows.length} montaje{filteredRows.length === 1 ? '' : 's'}
          {overdueCount > 0 && (
            <span className="installation-overdue">
              {' '}
              · {overdueCount} vencida{overdueCount === 1 ? '' : 's'}
            </span>
          )}
        </span>
      </div>

      {error && <div className="inline-error">{error}</div>}

      <div className="sales-order-table-card">
        <div className="sales-order-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Instalador(es)</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="sales-order-empty">
                    Cargando montajes…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="sales-order-empty">
                    No hay montajes con estos filtros.
                  </td>
                </tr>
              ) : (
                filteredRows.map(r => {
                  const overdue = r.status === 'SCHEDULED' && r.scheduledDate != null && r.scheduledDate < today;
                  return (
                    <tr key={r.id}>
                      <td className={overdue ? 'installation-overdue' : ''}>
                        {overdue && <AlertTriangle size={13} style={{ marginRight: 4, verticalAlign: 'text-bottom' }} />}
                        {fmtDate(r.scheduledDate)}
                        {r.startTime ? ` · ${r.startTime}` : ''}
                      </td>
                      <td>
                        <Link className="sales-order-code" to={`/ventas/pedidos/${r.salesOrderId}`}>
                          {r.salesOrderCode || `#${r.salesOrderId}`}
                        </Link>
                      </td>
                      <td>{r.customerName || '—'}</td>
                      <td>{r.installationTypeDescription || '—'}</td>
                      <td>{r.installers.length ? r.installers.map(i => i.name).join(', ') : '—'}</td>
                      <td>
                        <span className={`status-pill ${r.status.toLowerCase()}`}>{statusLabel[r.status]}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
