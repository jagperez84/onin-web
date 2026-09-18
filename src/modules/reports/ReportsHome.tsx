import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { FileText, CircleCheck, Clock, Wallet, TrendingUp, AlertTriangle, Users } from 'lucide-react';
import {
  defaultDateRange,
  getCollectionsAgingReport,
  getPipelineReport,
  getSalesReport,
  type CollectionsAgingReport,
  type DateRange,
  type PipelineReport,
  type SalesReport,
} from '../../services/reports/reportsRepository';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import '../quotations/quotation.css';
import './reports.css';

const money = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const date = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString('es-ES');

type ReportTab = 'pipeline' | 'ventas' | 'cobros';

const TABS: { key: ReportTab; label: string }[] = [
  { key: 'pipeline', label: 'Pipeline comercial' },
  { key: 'ventas', label: 'Ventas y facturación' },
  { key: 'cobros', label: 'Cobros pendientes' },
];

function Bar({ label, count, amount, share, tone }: { label: string; count: number; amount: number; share: number; tone: 'info' | 'success' | 'warning' | 'danger' }) {
  return (
    <div className="report-bar-row">
      <span className="report-bar-label">{label}</span>
      <div className="report-bar-track">
        <div className={`report-bar-fill ${tone}`} style={{ width: `${Math.max(share, count > 0 ? 2 : 0)}%` }} />
      </div>
      <span className="report-bar-amount">{money(amount)}</span>
      <span className="report-bar-count">
        {count} presup.{count === 1 ? '' : 's'}
      </span>
    </div>
  );
}

const STATUS_TONE: Record<string, 'info' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'info',
  SENT: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'warning',
  CANCELLED: 'danger',
};

function PipelineTab({ range }: { range: DateRange }) {
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getPipelineReport(range)
      .then((r) => active && setReport(r))
      .catch((e) => active && setError(e instanceof CoreRepositoryError ? e.message : 'No se pudo cargar el informe.'));
    return () => {
      active = false;
    };
  }, [range.from, range.to]);

  if (error) return <div className="inline-error">{error}</div>;
  if (!report) return <div className="loading-block">Cargando informe…</div>;

  const maxAmount = Math.max(1, ...report.byStatus.map((s) => s.amount));

  return (
    <>
      <div className="quotation-kpi-grid">
        <NavLink to="/ventas/presupuestos" className="quotation-kpi quotation-kpi-link">
          <div className="quotation-kpi-icon"><FileText size={18} /></div>
          <div>
            <span>Presupuestado en el periodo</span>
            <strong>{money(report.totalAmount)}</strong>
            <small>{report.totalCount} presupuesto{report.totalCount === 1 ? '' : 's'} emitidos</small>
          </div>
        </NavLink>
        <div className="quotation-kpi">
          <div className="quotation-kpi-icon"><CircleCheck size={18} /></div>
          <div>
            <span>Tasa de aceptación</span>
            <strong>{report.acceptanceRate}%</strong>
            <small>{report.acceptedCount} aceptados · {money(report.acceptedAmount)}</small>
          </div>
        </div>
        <NavLink to="/ventas/presupuestos" className={`quotation-kpi quotation-kpi-link ${report.openCount > 0 ? 'quotation-kpi-warning' : ''}`}>
          <div className="quotation-kpi-icon"><Clock size={18} /></div>
          <div>
            <span>Abiertos (borrador/enviado)</span>
            <strong>{report.openCount}</strong>
            <small>{money(report.openAmount)} en juego</small>
          </div>
        </NavLink>
      </div>

      <div className="report-section-title">Presupuestos por estado</div>
      <div className="table-panel report-bars">
        {report.byStatus.map((s) => (
          <Bar key={s.status} label={s.label} count={s.count} amount={s.amount} share={maxAmount ? (s.amount / maxAmount) * 100 : 0} tone={STATUS_TONE[s.status]} />
        ))}
      </div>

      <div className="report-section-title">Presupuestos abiertos más antiguos</div>
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Código</th>
              <th>Cliente</th>
              <th>Emitido</th>
              <th className="numeric">Días abierto</th>
              <th className="numeric">Importe</th>
            </tr>
          </thead>
          <tbody>
            {report.oldestOpen.length === 0 ? (
              <tr><td colSpan={5}>No hay presupuestos abiertos en el periodo.</td></tr>
            ) : (
              report.oldestOpen.map((r) => (
                <tr key={r.id}>
                  <td><NavLink to={`/ventas/presupuestos/${r.id}`}>{r.code}</NavLink></td>
                  <td>{r.customerName}</td>
                  <td>{date(r.issueDate)}</td>
                  <td className="numeric">{r.daysOpen}</td>
                  <td className="numeric">{money(r.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SalesTab({ range }: { range: DateRange }) {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getSalesReport(range)
      .then((r) => active && setReport(r))
      .catch((e) => active && setError(e instanceof CoreRepositoryError ? e.message : 'No se pudo cargar el informe.'));
    return () => {
      active = false;
    };
  }, [range.from, range.to]);

  if (error) return <div className="inline-error">{error}</div>;
  if (!report) return <div className="loading-block">Cargando informe…</div>;

  const maxMonth = Math.max(1, ...report.byMonth.map((m) => m.amount));
  const maxCustomer = Math.max(1, ...report.topCustomers.map((c) => c.amount));

  return (
    <>
      <div className="quotation-kpi-grid">
        <div className="quotation-kpi">
          <div className="quotation-kpi-icon"><TrendingUp size={18} /></div>
          <div>
            <span>Facturado en el periodo</span>
            <strong>{money(report.totalAmount)}</strong>
            <small>{report.invoiceCount} factura{report.invoiceCount === 1 ? '' : 's'}</small>
          </div>
        </div>
        <div className="quotation-kpi">
          <div className="quotation-kpi-icon"><FileText size={18} /></div>
          <div>
            <span>Ticket medio</span>
            <strong>{money(report.averageTicket)}</strong>
            <small>Por factura emitida</small>
          </div>
        </div>
        <NavLink to="/facturacion/facturas" className={`quotation-kpi quotation-kpi-link ${report.cancelledCount > 0 ? 'quotation-kpi-warning' : ''}`}>
          <div className="quotation-kpi-icon"><AlertTriangle size={18} /></div>
          <div>
            <span>Facturas anuladas</span>
            <strong>{report.cancelledCount}</strong>
            <small>Excluidas del total facturado</small>
          </div>
        </NavLink>
      </div>

      <div className="report-section-title">Facturación por mes</div>
      <div className="table-panel report-bars">
        {report.byMonth.length === 0 ? (
          <p>No hay facturas en el periodo seleccionado.</p>
        ) : (
          report.byMonth.map((m) => (
            <Bar key={m.month} label={m.label} count={m.count} amount={m.amount} share={maxMonth ? (m.amount / maxMonth) * 100 : 0} tone="info" />
          ))
        )}
      </div>

      <div className="report-section-title">Clientes principales</div>
      <div className="table-panel report-bars">
        {report.topCustomers.length === 0 ? (
          <p>No hay facturas en el periodo seleccionado.</p>
        ) : (
          report.topCustomers.map((cRow) => (
            <Bar key={cRow.customerId ?? cRow.customerName} label={cRow.customerName} count={cRow.count} amount={cRow.amount} share={maxCustomer ? (cRow.amount / maxCustomer) * 100 : 0} tone="success" />
          ))
        )}
      </div>
    </>
  );
}

const AGING_TONE: Record<string, 'danger' | 'warning' | 'info' | 'success'> = {
  overdue: 'danger',
  due7: 'warning',
  due30: 'info',
  later: 'success',
};

function CollectionsTab() {
  const [report, setReport] = useState<CollectionsAgingReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getCollectionsAgingReport()
      .then((r) => active && setReport(r))
      .catch((e) => active && setError(e instanceof CoreRepositoryError ? e.message : 'No se pudo cargar el informe.'));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <div className="inline-error">{error}</div>;
  if (!report) return <div className="loading-block">Cargando informe…</div>;

  const maxBucket = Math.max(1, ...report.buckets.map((b) => b.amount));

  return (
    <>
      <div className="quotation-kpi-grid">
        <NavLink to="/facturacion/cobros" className="quotation-kpi quotation-kpi-link">
          <div className="quotation-kpi-icon"><Wallet size={18} /></div>
          <div>
            <span>Pendiente de cobro</span>
            <strong>{money(report.pendingTotal)}</strong>
            <small>{report.pendingCount} plazo{report.pendingCount === 1 ? '' : 's'} pendientes</small>
          </div>
        </NavLink>
        <NavLink to="/facturacion/cobros" className={`quotation-kpi quotation-kpi-link ${report.overdueCount > 0 ? 'quotation-kpi-warning' : ''}`}>
          <div className="quotation-kpi-icon"><AlertTriangle size={18} /></div>
          <div>
            <span>Vencido</span>
            <strong>{money(report.overdueTotal)}</strong>
            <small>{report.overdueCount} plazo{report.overdueCount === 1 ? '' : 's'} vencidos</small>
          </div>
        </NavLink>
        <div className="quotation-kpi">
          <div className="quotation-kpi-icon"><Users size={18} /></div>
          <div>
            <span>% pendiente vencido</span>
            <strong>{report.pendingTotal ? Math.round((report.overdueTotal / report.pendingTotal) * 100) : 0}%</strong>
            <small>Sobre el total pendiente de cobro</small>
          </div>
        </div>
      </div>

      <div className="report-section-title">Antigüedad de saldos pendientes</div>
      <div className="table-panel report-bars">
        {report.buckets.map((b) => (
          <Bar key={b.key} label={b.label} count={b.count} amount={b.amount} share={maxBucket ? (b.amount / maxBucket) * 100 : 0} tone={AGING_TONE[b.key]} />
        ))}
      </div>
    </>
  );
}

export function ReportsHome() {
  const [tab, setTab] = useState<ReportTab>('pipeline');
  const [range, setRange] = useState<DateRange>(() => defaultDateRange());

  const rangeInputs = useMemo(
    () => (
      <div className="report-filters">
        <label>
          Desde
          <input type="date" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </label>
        <label>
          Hasta
          <input type="date" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </label>
      </div>
    ),
    [range.from, range.to],
  );

  return (
    <div className="module-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">INFORMES</div>
          <h1>Informes</h1>
          <p>Indicadores clave del negocio: pipeline comercial, ventas facturadas y cobros pendientes.</p>
        </div>
      </div>

      <div className="report-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`report-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'cobros' && rangeInputs}

      {tab === 'pipeline' && <PipelineTab range={range} />}
      {tab === 'ventas' && <SalesTab range={range} />}
      {tab === 'cobros' && <CollectionsTab />}
    </div>
  );
}
