import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  listAuditLog,
  AUDIT_TABLES,
  AUDIT_TABLE_LABELS,
  AUDIT_ACTION_LABELS,
  type AuditLogRow,
  type AuditAction,
  type AuditTable,
} from '../../services/audit/auditLogRepository';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import './audit-log.css';

const ALL_ACTIONS: AuditAction[] = ['INSERT', 'UPDATE', 'DELETE'];
const ACTION_TONE: Record<AuditAction, string> = { INSERT: 'success', UPDATE: '', DELETE: 'danger' };
const PAGE_SIZE = 50;

const dateTime = (v: string) => new Date(v).toLocaleString('es-ES');

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatValue(v: unknown) {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function DiffRow({ row }: { row: AuditLogRow }) {
  const fields =
    row.action === 'UPDATE'
      ? row.changedFields ?? []
      : Object.keys((row.newData ?? row.oldData ?? {}) as Record<string, unknown>);
  return (
    <tr className="audit-log-detail-row">
      <td colSpan={7}>
        <table className="audit-log-diff">
          <thead>
            <tr>
              <th>Campo</th>
              <th>Antes</th>
              <th>Después</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f}>
                <td>{f}</td>
                <td>{formatValue((row.oldData as Record<string, unknown> | null)?.[f])}</td>
                <td>{formatValue((row.newData as Record<string, unknown> | null)?.[f])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

export function AuditLog() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [table, setTable] = useState<AuditTable | 'ALL'>('ALL');
  const [action, setAction] = useState<AuditAction | 'ALL'>('ALL');
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    setPage(0);
  }, [table, action, from, to]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listAuditLog({ table, action, from, to }, page)
      .then((r) => {
        if (!active) return;
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e) => {
        if (active) setError(e instanceof CoreRepositoryError ? e.message : 'No se pudo cargar el registro de auditoría.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [table, action, from, to, page]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="module-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">CONFIGURACIÓN / SEGURIDAD</div>
          <h1>Auditoría</h1>
          <p>Quién hizo qué sobre presupuestos, pedidos, facturas, cobros, montajes, clientes y usuarios.</p>
        </div>
      </div>

      <div className="audit-log-filters">
        <label>
          Módulo
          <select value={table} onChange={(e) => setTable(e.target.value as AuditTable | 'ALL')}>
            <option value="ALL">Todos</option>
            {AUDIT_TABLES.map((t) => (
              <option key={t} value={t}>
                {AUDIT_TABLE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Acción
          <select value={action} onChange={(e) => setAction(e.target.value as AuditAction | 'ALL')}>
            <option value="ALL">Todas</option>
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Hasta
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {error && <div className="inline-error">{error}</div>}

      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Módulo</th>
              <th>Documento</th>
              <th>Acción</th>
              <th>Campos cambiados</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>Cargando…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>No hay eventos en el periodo seleccionado.</td>
              </tr>
            ) : (
              rows.flatMap((r) => {
                const isOpen = expanded === r.id;
                const line = (
                  <tr key={r.id} className="audit-log-row-clickable" onClick={() => setExpanded(isOpen ? null : r.id)}>
                    <td>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td>{dateTime(r.changedAt)}</td>
                    <td>{r.userName}</td>
                    <td>{r.tableLabel}</td>
                    <td>{r.recordLabel}</td>
                    <td>
                      <span className={`status-pill ${ACTION_TONE[r.action]}`}>{AUDIT_ACTION_LABELS[r.action]}</span>
                    </td>
                    <td>{r.changedFields?.length ? r.changedFields.join(', ') : '—'}</td>
                  </tr>
                );
                return isOpen ? [line, <DiffRow key={`${r.id}-diff`} row={r} />] : [line];
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="audit-log-pagination">
        <button type="button" className="secondary-button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </button>
        <span>
          Página {page + 1} de {pageCount} · {total} evento{total === 1 ? '' : 's'}
        </span>
        <button type="button" className="secondary-button" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>
          Siguiente
        </button>
      </div>
    </div>
  );
}
