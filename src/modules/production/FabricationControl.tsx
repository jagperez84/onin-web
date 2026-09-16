import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Boxes,
  CheckCircle2,
  Clock,
  Eye,
  Factory,
  FileDown,
  Hammer,
  HelpCircle,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  Search,
  Unlock,
  X,
} from 'lucide-react';
import {
  blockSalesOrder,
  getOrderBlockReason,
  isOrderBlocked,
  listSalesOrders,
  unblockSalesOrder,
  type SalesOrder,
  type SalesOrderSortField,
  type SalesOrderStatus,
} from '../../services/sales/salesOrderService';
import {
  checkMultipleOrdersMaterialAvailability,
  checkOrderMaterialAvailability,
  type OrderMaterialAvailability,
} from '../../services/production/materialAvailabilityService';
import { generateAndDownloadOrderDossier } from '../../services/production/orderManufacturingReportPdfService';
import { resolveCurrentCompanyId } from '../../services/production/installationService';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import { confirmDialog } from '../../components/ui/ConfirmDialog';
import { OrderFabricationModal } from '../orders/OrderFabricationModal';
import './fabrication-control.css';

type FilterTab = 'ALL' | 'PENDING' | 'FABRICATING' | 'BLOCKED' | 'COMPLETED';

const statusLabel: Record<string, string> = {
  PENDING_MANUFACTURING: 'Pendiente de fabricación',
  PREPARED: 'Preparado',
  FABRICATING: 'Fabricando',
  CONFECTIONED: 'Confeccionado',
  MANUFACTURED: 'Fabricado',
  INSTALLATION_SCHEDULED: 'Montaje programado',
  INSTALLED: 'Instalado',
  INVOICED: 'Facturado',
  CANCELLED: 'Cancelado',
  BLOCKED: 'Bloqueado',
};

const dateFmt = (v: string | null) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString('es-ES') : '—');

function deliveryUrgency(r: SalesOrder): 'overdue' | 'soon' | null {
  if (!r.requested_delivery_date || r.status === 'INSTALLED' || r.status === 'INVOICED' || r.status === 'CANCELLED') return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${r.requested_delivery_date}T00:00:00`);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 3) return 'soon';
  return null;
}

function detectProductTypes(order: SalesOrder): { label: string; type: 'toldo' | 'pergola' | 'otd' | 'standard' }[] {
  const lines = order.lines || [];
  const types: { label: string; type: 'toldo' | 'pergola' | 'otd' | 'standard' }[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const snapshot = (line?.specific_data?.configuration_snapshot || line?.specific_data?.otd_snapshot) as any;
    const desc = (line.description || '').toLowerCase();
    const otdCode = (snapshot?.otd_code || '').toLowerCase();

    if (otdCode.includes('perg') || desc.includes('pérgola') || desc.includes('pergola')) {
      if (!seen.has('pergola')) {
        seen.add('pergola');
        types.push({ label: 'Pérgola OTD', type: 'pergola' });
      }
    } else if (otdCode.includes('toldo') || desc.includes('toldo') || snapshot?.components?.length) {
      if (!seen.has('toldo')) {
        seen.add('toldo');
        types.push({ label: 'Toldo OTD', type: 'toldo' });
      }
    } else if (snapshot?.otd_code) {
      if (!seen.has('otd')) {
        seen.add('otd');
        types.push({ label: `OTD ${snapshot.otd_code}`, type: 'otd' });
      }
    }
  }

  if (types.length === 0) {
    types.push({ label: 'Estándar', type: 'standard' });
  }

  return types;
}

export function FabricationControl() {
  const [companyId, setCompanyId] = useState<number>(0);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [availabilities, setAvailabilities] = useState<Record<number, OrderMaterialAvailability>>({});
  const [activeTab, setActiveTab] = useState<FilterTab>('PENDING');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SalesOrderSortField>('requested_delivery_date');
  const [ascending, setAscending] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [fabricatingOrder, setFabricatingOrder] = useState<SalesOrder | null>(null);
  const [breakdownOrder, setBreakdownOrder] = useState<{ order: SalesOrder; availability: OrderMaterialAvailability } | null>(null);
  const [blockingOrder, setBlockingOrder] = useState<SalesOrder | null>(null);
  const [downloadingDossierId, setDownloadingDossierId] = useState<number | null>(null);

  // Load orders and availability
  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const cid = await resolveCurrentCompanyId();
      setCompanyId(cid);

      const allOrders = await listSalesOrders(search, sortBy, ascending);
      setOrders(allOrders);

      // Check stock availability for un-finished orders
      const openOrders = allOrders.filter(
        o => o.status !== 'INSTALLED' && o.status !== 'INVOICED' && o.status !== 'CANCELLED'
      );
      if (openOrders.length > 0 && cid > 0) {
        checkMultipleOrdersMaterialAvailability(openOrders, cid).then(res => {
          setAvailabilities(res);
        }).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : 'Error al cargar el control de fabricación.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void loadData(), 200);
    return () => clearTimeout(t);
  }, [search, sortBy, ascending]);

  // Tab counts
  const counts = useMemo(() => {
    let pending = 0;
    let fabricating = 0;
    let blocked = 0;
    let completed = 0;

    for (const o of orders) {
      if (isOrderBlocked(o)) {
        blocked++;
      } else if (o.status === 'PENDING_MANUFACTURING' || o.status === 'PREPARED') {
        pending++;
      } else if (o.status === 'FABRICATING' || o.status === 'CONFECTIONED') {
        fabricating++;
      } else if (['MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED', 'INVOICED'].includes(o.status)) {
        completed++;
      }
    }

    return { all: orders.length, pending, fabricating, blocked, completed };
  }, [orders]);

  // Filtered list
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const blocked = isOrderBlocked(o);
      if (activeTab === 'BLOCKED') return blocked;
      if (activeTab === 'PENDING') return !blocked && (o.status === 'PENDING_MANUFACTURING' || o.status === 'PREPARED');
      if (activeTab === 'FABRICATING') return !blocked && (o.status === 'FABRICATING' || o.status === 'CONFECTIONED');
      if (activeTab === 'COMPLETED') return !blocked && ['MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED', 'INVOICED'].includes(o.status);
      return true;
    });
  }, [orders, activeTab]);

  // Download Dossier
  async function handleDownloadDossier(order: SalesOrder) {
    try {
      setDownloadingDossierId(order.id);
      await generateAndDownloadOrderDossier(order.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al generar el dossier de fabricación.');
    } finally {
      setDownloadingDossierId(null);
    }
  }

  // Unblock action
  async function handleUnblock(order: SalesOrder) {
    const ok = await confirmDialog({
      title: 'Desbloquear pedido',
      message: `¿Deseas retirar el bloqueo del pedido ${order.code} y devolverlo a la cola de fabricación?`,
      confirmLabel: 'Desbloquear pedido',
    });
    if (!ok) return;

    try {
      await unblockSalesOrder(order.id, 'Desbloqueado desde Control de Fabricación');
      await loadData();
    } catch (e) {
      alert(e instanceof CoreRepositoryError ? e.message : 'No se pudo desbloquear el pedido.');
    }
  }

  // Refresh single order availability
  async function refreshOrderAvailability(orderId: number) {
    const target = orders.find(o => o.id === orderId);
    if (!target || companyId <= 0) return;
    try {
      const avail = await checkOrderMaterialAvailability(target, companyId);
      setAvailabilities(prev => ({ ...prev, [orderId]: avail }));
    } catch {
      // Non-blocking
    }
  }

  return (
    <div className="module-page fabrication-control-page">
      {/* Head */}
      <div className="fabrication-control-head">
        <div>
          <div className="eyebrow">PRODUCCIÓN / TALLER</div>
          <div className="fabrication-control-title-row">
            <h1>Control de Fabricación</h1>
            <span className="fabrication-badge">
              <Factory size={14} /> Gestión Operativa de Taller
            </span>
          </div>
          <p>
            Supervisión integral de pedidos, verificación de existencias de material y ejecución de fabricación.
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadData()}>
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="fabrication-summary-grid">
        <div className="fabrication-summary-card">
          <span>Pendientes de taller</span>
          <strong>{counts.pending}</strong>
          <small>Listos para planificar o cortar</small>
        </div>
        <div className="fabrication-summary-card">
          <span>En fabricación</span>
          <strong>{counts.fabricating}</strong>
          <small>Cortes o confección en curso</small>
        </div>
        <div className="fabrication-summary-card blocked">
          <span>Bloqueados</span>
          <strong>{counts.blocked}</strong>
          <small>Detenidos por material o taller</small>
        </div>
        <div className="fabrication-summary-card available">
          <span>Disponibilidad comprobada</span>
          <strong>
            {Object.values(availabilities).filter(a => a.status === 'FULL').length}
          </strong>
          <small>Pedidos con 100% de material en stock</small>
        </div>
      </div>

      {/* Tabs */}
      <div className="fabrication-tabs">
        <button
          type="button"
          className={`fabrication-tab-btn ${activeTab === 'PENDING' ? 'active' : ''}`}
          onClick={() => setActiveTab('PENDING')}
        >
          <Clock size={15} /> Pendientes
          <span className="fabrication-tab-badge">{counts.pending}</span>
        </button>
        <button
          type="button"
          className={`fabrication-tab-btn ${activeTab === 'FABRICATING' ? 'active' : ''}`}
          onClick={() => setActiveTab('FABRICATING')}
        >
          <Hammer size={15} /> En fabricación
          <span className="fabrication-tab-badge">{counts.fabricating}</span>
        </button>
        <button
          type="button"
          className={`fabrication-tab-btn ${activeTab === 'BLOCKED' ? 'active' : ''}`}
          onClick={() => setActiveTab('BLOCKED')}
        >
          <Lock size={15} /> Bloqueados
          <span className={`fabrication-tab-badge ${counts.blocked > 0 ? 'danger' : ''}`}>
            {counts.blocked}
          </span>
        </button>
        <button
          type="button"
          className={`fabrication-tab-btn ${activeTab === 'COMPLETED' ? 'active' : ''}`}
          onClick={() => setActiveTab('COMPLETED')}
        >
          <CheckCircle2 size={15} /> Terminados recientemente
          <span className="fabrication-tab-badge">{counts.completed}</span>
        </button>
        <button
          type="button"
          className={`fabrication-tab-btn ${activeTab === 'ALL' ? 'active' : ''}`}
          onClick={() => setActiveTab('ALL')}
        >
          Todos los pedidos
          <span className="fabrication-tab-badge">{counts.all}</span>
        </button>
      </div>

      {/* Toolbar */}
      <div className="fabrication-toolbar">
        <div className="search-box fabrication-search">
          <Search size={16} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por pedido, cliente o referencia…"
          />
        </div>

        <div className="sales-order-sort">
          <label htmlFor="sort-field">Ordenar por</label>
          <select
            id="sort-field"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SalesOrderSortField)}
          >
            <option value="requested_delivery_date">Fecha de entrega solicitada</option>
            <option value="created_at">Fecha de creación</option>
          </select>
          <button
            type="button"
            className="icon-link"
            onClick={() => setAscending(a => !a)}
            title={ascending ? 'Orden ascendente' : 'Orden descendente'}
          >
            {ascending ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          </button>
        </div>

        <span className="sales-order-count">
          {filteredOrders.length} {filteredOrders.length === 1 ? 'pedido' : 'pedidos'}
        </span>
      </div>

      {error && <div className="inline-error">{error}</div>}

      {/* Orders Table */}
      <div className="table-panel sales-order-table-card">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Entrega solicitada</th>
              <th>Tipo de producto</th>
              <th>Estado de fabricación</th>
              <th>Disponibilidad de material</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="sales-order-empty">
                  Cargando pedidos de fabricación…
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={7} className="sales-order-empty">
                  No hay pedidos en este estado.
                </td>
              </tr>
            ) : (
              filteredOrders.map(order => {
                const blocked = isOrderBlocked(order);
                const blockReason = blocked ? getOrderBlockReason(order) : null;
                const urgency = deliveryUrgency(order);
                const productTypes = detectProductTypes(order);
                const availability = availabilities[order.id];

                return (
                  <tr key={order.id} className={urgency ? `sales-order-row-${urgency}` : ''}>
                    {/* Pedido */}
                    <td>
                      <Link className="sales-order-code" to={`/ventas/pedidos/${order.id}`}>
                        {order.code}
                      </Link>
                      {order.reference && <div className="muted">{order.reference}</div>}
                    </td>

                    {/* Cliente */}
                    <td>
                      <strong>{order.customer_name || '—'}</strong>
                    </td>

                    {/* Fecha de entrega */}
                    <td>
                      <div>{dateFmt(order.requested_delivery_date)}</div>
                      {urgency === 'overdue' && (
                        <span className="status-pill danger" style={{ fontSize: '11px', marginTop: 2 }}>
                          Retrasado
                        </span>
                      )}
                      {urgency === 'soon' && (
                        <span className="status-pill warning" style={{ fontSize: '11px', marginTop: 2 }}>
                          Próximo (≤3d)
                        </span>
                      )}
                    </td>

                    {/* Tipo de producto */}
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {productTypes.map((pt, idx) => (
                          <span key={idx} className={`product-type-pill ${pt.type}`}>
                            {pt.label}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Estado de fabricación */}
                    <td>
                      {blocked ? (
                        <div>
                          <span className="status-pill danger">
                            <Lock size={11} style={{ marginRight: 4 }} /> Bloqueado
                          </span>
                          {blockReason && (
                            <span className="block-reason-hint" title={blockReason}>
                              Motivo: {blockReason}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span
                          className={`status-pill ${
                            order.status === 'MANUFACTURED' ||
                            order.status === 'INSTALLATION_SCHEDULED' ||
                            order.status === 'INSTALLED' ||
                            order.status === 'INVOICED'
                              ? 'success'
                              : order.status === 'PENDING_MANUFACTURING'
                              ? 'warning'
                              : ''
                          }`}
                        >
                          {statusLabel[order.status] || order.status}
                        </span>
                      )}
                    </td>

                    {/* Disponibilidad de material */}
                    <td>
                      {!availability ? (
                        <span
                          className="availability-pill loading"
                          onClick={() => void refreshOrderAvailability(order.id)}
                          title="Hacer clic para verificar stock"
                        >
                          <Loader2 size={12} className="spinning" /> Comprobando…
                        </span>
                      ) : availability.status === 'FULL' ? (
                        <span
                          className="availability-pill full"
                          onClick={() => setBreakdownOrder({ order, availability })}
                          title="Ver detalle de stock comprobado"
                        >
                          <CheckCircle2 size={13} /> Disponible
                        </span>
                      ) : availability.status === 'PARTIAL' ? (
                        <span
                          className="availability-pill partial"
                          onClick={() => setBreakdownOrder({ order, availability })}
                          title={`Parcial (${availability.missingCount} faltantes). Clic para ver desglose.`}
                        >
                          <AlertTriangle size={13} /> Parcial ({availability.missingCount})
                        </span>
                      ) : (
                        <span
                          className="availability-pill missing"
                          onClick={() => setBreakdownOrder({ order, availability })}
                          title={`Sin stock suficiente (${availability.missingCount} faltantes). Clic para ver desglose.`}
                        >
                          <AlertCircle size={13} /> Sin stock ({availability.missingCount})
                        </span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td>
                      <div className="table-actions-cell">
                        {/* Dossier de Fabricación PDF */}
                        <button
                          type="button"
                          className="secondary-button compact"
                          onClick={() => void handleDownloadDossier(order)}
                          disabled={downloadingDossierId === order.id}
                          title="Descargar Dossier consolidado de fabricación en PDF"
                        >
                          {downloadingDossierId === order.id ? (
                            <Loader2 size={13} className="spinning" />
                          ) : (
                            <FileDown size={13} />
                          )}
                          Dossier
                        </button>

                        {/* Centro de Fabricación */}
                        <button
                          type="button"
                          className="primary-button compact"
                          onClick={() => setFabricatingOrder(order)}
                          disabled={blocked}
                          title={blocked ? 'Pedido bloqueado: desbloquéalo antes de fabricar' : 'Abrir Centro de Fabricación para cortar, confeccionar o descontar componentes'}
                        >
                          <Hammer size={13} /> Fabricar
                        </button>

                        {/* Bloquear / Desbloquear */}
                        {blocked ? (
                          <button
                            type="button"
                            className="secondary-button compact"
                            onClick={() => void handleUnblock(order)}
                            title="Desbloquear pedido"
                            style={{ color: 'var(--status-success-fg)' }}
                          >
                            <Unlock size={13} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="secondary-button compact"
                            onClick={() => setBlockingOrder(order)}
                            title="Bloquear pedido / Registrar incidencia"
                            style={{ color: 'var(--status-danger-fg)' }}
                          >
                            <Lock size={13} />
                          </button>
                        )}

                        {/* Ver pedido */}
                        <Link
                          to={`/ventas/pedidos/${order.id}`}
                          className="icon-link"
                          title="Ver ficha completa del pedido"
                        >
                          <Eye size={15} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Centro de Fabricación existente */}
      {fabricatingOrder && (
        <OrderFabricationModal
          order={fabricatingOrder}
          companyId={companyId}
          onClose={() => setFabricatingOrder(null)}
          onDone={({ orderManufactured }) => {
            if (orderManufactured) {
              setOrders(prev =>
                prev.map(o => (o.id === fabricatingOrder.id ? { ...o, status: 'MANUFACTURED' } : o))
              );
            }
            void loadData();
          }}
        />
      )}

      {/* Modal: Desglose de disponibilidad de material */}
      {breakdownOrder && (
        <div className="modal-overlay" onClick={() => setBreakdownOrder(null)}>
          <div className="modal-content-card wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header-row">
              <div>
                <div className="eyebrow">VERIFICACIÓN DE MATERIALES</div>
                <h2>Disponibilidad · {breakdownOrder.order.code}</h2>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                  {breakdownOrder.order.customer_name || 'Cliente'}
                </p>
              </div>
              <button
                type="button"
                className="icon-link"
                onClick={() => setBreakdownOrder(null)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            {breakdownOrder.availability.status === 'FULL' ? (
              <div className="breakdown-success-card">
                <CheckCircle2 size={22} color="var(--status-success-fg)" />
                <div>
                  <strong>Todo el material necesario está disponible en almacén</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                    Perfiles, lonas y componentes tienen suficiente stock físico para fabricar el pedido.
                  </p>
                </div>
              </div>
            ) : (
              <div className="breakdown-missing-card">
                <AlertCircle size={22} color="var(--status-danger-fg)" />
                <div>
                  <strong>{breakdownOrder.availability.summary}</strong>
                  <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                    Se han identificado {breakdownOrder.availability.missingCount} materiales sin existencias suficientes en almacén.
                  </p>
                </div>
              </div>
            )}

            {breakdownOrder.availability.missingMaterials.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>Materiales faltantes</h3>
                <div className="table-panel card-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Categoría</th>
                        <th>Línea</th>
                        <th>Material</th>
                        <th>Requerido</th>
                        <th>Stock disponible</th>
                        <th>Faltante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdownOrder.availability.missingMaterials.map((m, i) => (
                        <tr key={i}>
                          <td>
                            <span className="product-type-pill">
                              {m.category === 'PROFILE'
                                ? 'Perfil'
                                : m.category === 'LONA'
                                ? 'Lona'
                                : 'Componente'}
                            </span>
                          </td>
                          <td>Línea #{m.lineNo}</td>
                          <td>
                            <strong>{m.description}</strong>
                            {m.productCode && <div className="muted">{m.productCode}</div>}
                          </td>
                          <td>{m.required}</td>
                          <td>
                            <span style={{ color: 'var(--status-danger-fg)' }}>{m.available}</span>
                          </td>
                          <td>
                            <strong>{m.missingQty != null ? `${m.missingQty}` : '—'}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setBreakdownOrder(null)}
              >
                Cerrar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  const o = breakdownOrder.order;
                  setBreakdownOrder(null);
                  setFabricatingOrder(o);
                }}
              >
                <Hammer size={14} /> Abrir Centro de Fabricación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Bloquear Pedido / Incidencia */}
      {blockingOrder && (
        <BlockOrderModal
          order={blockingOrder}
          onClose={() => setBlockingOrder(null)}
          onBlocked={async () => {
            setBlockingOrder(null);
            await loadData();
          }}
        />
      )}
    </div>
  );
}

function BlockOrderModal({
  order,
  onClose,
  onBlocked,
}: {
  order: SalesOrder;
  onClose: () => void;
  onBlocked: () => void;
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const quickReasons = [
    'Falta de stock de perfil',
    'Falta de tejido / lona',
    'Rotura de stock de componentes',
    'Incidencia técnica en taller',
    'Avería en bancada de corte',
    'Esperando confirmación de medidas del cliente',
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Por favor indica el motivo del bloqueo.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await blockSalesOrder(order.id, reason);
      onBlocked();
    } catch (err) {
      setError(err instanceof CoreRepositoryError ? err.message : 'Error al registrar el bloqueo.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header-row">
          <div>
            <div className="eyebrow">TALLER / INCIDENCIAS</div>
            <h2>Bloquear fabricación · {order.code}</h2>
          </div>
          <button type="button" className="icon-link" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--muted)', marginTop: 0 }}>
          Al bloquear el pedido se suspenderá la fabricación y se avisará a la agenda de montajes para
          evitar enviar la cuadrilla.
        </p>

        {error && <div className="inline-error" style={{ marginBottom: 12 }}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: 6 }}>
            Motivos frecuentes:
          </label>
          <div className="quick-reason-chips">
            {quickReasons.map(r => (
              <button
                key={r}
                type="button"
                className="quick-reason-chip"
                onClick={() => setReason(r)}
              >
                {r}
              </button>
            ))}
          </div>

          <label
            htmlFor="block-reason-input"
            style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: 6 }}
          >
            Motivo del bloqueo o incidencia:
          </label>
          <textarea
            id="block-reason-input"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Describe la causa (ej: Falta perfil 120x60 en blanco o rotura de stock)…"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontSize: '13.5px',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <button type="button" className="secondary-button" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={submitting || !reason.trim()}
              style={{ background: 'var(--status-danger-fg, #dc2626)' }}
            >
              <Lock size={14} /> {submitting ? 'Bloqueando…' : 'Bloquear pedido'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
