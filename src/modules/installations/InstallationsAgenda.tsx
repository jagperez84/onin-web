import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CoreRepositoryError } from '../../services/core/coreRepository';
import { confirmDialog } from '../../components/ui/ConfirmDialog';
import {
  INSTALLATION_STATUS_LABEL,
  INSTALLATION_STATUS_TONE,
  listFieldStaff,
  listInstallations,
  listOrdersAwaitingInstallation,
  resolveCurrentCompanyId,
  upsertInstallation,
  type Installation,
  type Installer,
  type OrderAwaitingInstallation,
} from '../../services/production/installationService';
import { listInstallationCrews, type InstallationCrew } from '../../services/production/installationCrewService';
import '../map/map-view.css';
import './installations-agenda.css';

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDaysStr(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}
function startOfWeekStr(base = new Date()): string {
  const offset = (base.getDay() + 6) % 7; // lunes = 0
  return addDaysStr(toDateStr(base), -offset);
}
function todayStr(): string {
  return toDateStr(new Date());
}
function formatDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
function formatDayLong(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' });
}

type Lane = { key: string; label: string; color: string | null; crewId: number | null };

function DraggableCard({ id, disabled, children }: { id: string; disabled?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={`agenda-card ${disabled ? 'not-draggable' : ''} ${isDragging ? 'is-dragging' : ''}`}>
      {children}
    </div>
  );
}

function DroppableCell({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`agenda-cell ${isOver ? 'is-over' : ''}`}>
      {children}
    </div>
  );
}

function InstallationCard({ inst }: { inst: Installation }) {
  const hasOpenIncident = inst.incidents.some((i) => i.status === 'OPEN');
  return (
    <Link to={`/ventas/pedidos/${inst.salesOrderId}`} className="agenda-card-link">
      <span className="agenda-card-head">
        <GripVertical size={12} />
        {inst.startTime && <strong>{inst.startTime}</strong>}
        <span className={`status-pill ${INSTALLATION_STATUS_TONE[inst.status]}`}>{INSTALLATION_STATUS_LABEL[inst.status]}</span>
      </span>
      <span className="agenda-card-title">{inst.salesOrderCode || `#${inst.salesOrderId}`}</span>
      <span className="agenda-card-sub">{inst.customerName || '—'}</span>
      {hasOpenIncident && <span className="status-pill danger">Incidencia abierta</span>}
    </Link>
  );
}

function OrderCard({ order }: { order: OrderAwaitingInstallation }) {
  return (
    <Link to={`/ventas/pedidos/${order.salesOrderId}`} className="agenda-card-link">
      <span className="agenda-card-head">
        <GripVertical size={12} />
        <span className="status-pill">Fabricado</span>
      </span>
      <span className="agenda-card-title">{order.code}</span>
      <span className="agenda-card-sub">{order.customerName || '—'}</span>
      <span className="agenda-card-lines">{order.linesLabel}</span>
    </Link>
  );
}

export function InstallationsAgenda() {
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [weekStart, setWeekStart] = useState(startOfWeekStr());
  const [crews, setCrews] = useState<InstallationCrew[]>([]);
  const [fieldStaff, setFieldStaff] = useState<Installer[]>([]);
  const [allInstallations, setAllInstallations] = useState<Installation[]>([]);
  const [ordersBacklog, setOrdersBacklog] = useState<OrderAwaitingInstallation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    resolveCurrentCompanyId()
      .then(setCompanyId)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo determinar la empresa.'));
  }, []);

  async function loadAll(cid: number) {
    try {
      setLoading(true);
      setError('');
      const [crewsResult, scheduled, inProgress, blocked, staffResult, ordersResult] = await Promise.all([
        listInstallationCrews('active'),
        listInstallations({ companyId: cid, status: 'SCHEDULED' }),
        listInstallations({ companyId: cid, status: 'IN_PROGRESS' }),
        listInstallations({ companyId: cid, status: 'BLOCKED' }),
        listFieldStaff(cid),
        listOrdersAwaitingInstallation(cid),
      ]);
      setCrews(crewsResult);
      setAllInstallations([...scheduled, ...inProgress, ...blocked]);
      setFieldStaff(staffResult);
      setOrdersBacklog(ordersResult);
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : 'No se pudo cargar la agenda.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (companyId != null) void loadAll(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i)), [weekStart]);
  const weekEnd = days[6];
  const weekInstallations = useMemo(
    () => allInstallations.filter((i) => i.scheduledDate && i.scheduledDate >= weekStart && i.scheduledDate <= weekEnd),
    [allInstallations, weekStart, weekEnd]
  );
  const undatedInstallations = useMemo(() => allInstallations.filter((i) => !i.scheduledDate), [allInstallations]);
  const staffById = useMemo(() => new Map(fieldStaff.map((s) => [s.id, s.name])), [fieldStaff]);
  const lanes: Lane[] = useMemo(
    () => [
      ...crews.map((c) => ({ key: `crew-${c.id}`, label: c.name, color: c.color, crewId: c.id })),
      { key: 'none', label: 'Sin cuadrilla asignada', color: null, crewId: null },
    ],
    [crews]
  );

  function crewInstallers(crewId: number | null): Installer[] {
    if (crewId == null) return [];
    const crew = crews.find((c) => c.id === crewId);
    if (!crew) return [];
    return crew.memberIds.map((id) => ({ id, name: staffById.get(id) || `Usuario #${id}` }));
  }

  async function confirmIfCrewBusy(crewId: number | null, date: string, excludeInstallationId?: number): Promise<boolean> {
    if (crewId == null) return true;
    const clash = allInstallations.find((i) => i.id !== excludeInstallationId && i.crewId === crewId && i.scheduledDate === date);
    if (!clash) return true;
    const crew = crews.find((c) => c.id === crewId);
    return confirmDialog({
      title: 'Cuadrilla ya ocupada ese día',
      message: `${crew?.name || 'Esta cuadrilla'} ya tiene el montaje ${clash.salesOrderCode || `#${clash.salesOrderId}`} el ${formatDayLong(date)}. ¿Programar igualmente?`,
      confirmLabel: 'Programar igualmente',
    });
  }

  async function moveInstallation(inst: Installation, date: string, crewId: number | null) {
    if (!(await confirmIfCrewBusy(crewId, date, inst.id)) || companyId == null) return;
    setBusy(true);
    setError('');
    try {
      await upsertInstallation({
        id: inst.id,
        companyId,
        salesOrderId: inst.salesOrderId,
        installationTypeId: inst.installationTypeId,
        scheduledDate: date,
        startTime: inst.startTime,
        estimatedDuration: inst.estimatedDuration,
        crewId,
        installers: crewId != null ? crewInstallers(crewId) : inst.installers,
        notes: inst.notes,
      });
      await loadAll(companyId);
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : 'No se pudo reprogramar el montaje.');
    } finally {
      setBusy(false);
    }
  }

  async function scheduleOrder(order: OrderAwaitingInstallation, date: string, crewId: number | null) {
    if (!(await confirmIfCrewBusy(crewId, date)) || companyId == null) return;
    setBusy(true);
    setError('');
    try {
      await upsertInstallation({
        id: null,
        companyId,
        salesOrderId: order.salesOrderId,
        installationTypeId: null,
        scheduledDate: date,
        startTime: null,
        estimatedDuration: null,
        crewId,
        installers: crewInstallers(crewId),
        notes: null,
        salesOrderLineIds: order.lineIds,
      });
      await loadAll(companyId);
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : 'No se pudo programar la visita.');
    } finally {
      setBusy(false);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || busy) return;
    const overId = String(over.id);
    if (!overId.startsWith('cell:')) return;
    const [, laneKey, date] = overId.split(':');
    const crewId = laneKey === 'none' ? null : Number(laneKey.replace('crew-', ''));
    const activeId = String(active.id);
    if (activeId.startsWith('card:installation:')) {
      const id = Number(activeId.split(':')[2]);
      const inst = allInstallations.find((i) => i.id === id);
      if (inst) void moveInstallation(inst, date, crewId);
    } else if (activeId.startsWith('card:order:')) {
      const salesOrderId = Number(activeId.split(':')[2]);
      const order = ordersBacklog.find((o) => o.salesOrderId === salesOrderId);
      if (order) void scheduleOrder(order, date, crewId);
    }
  }

  if (loading) return <div className="loading-block">Cargando agenda…</div>;

  return (
    <div className="agenda-wrap">
      {error && <div className="inline-error">{error}</div>}
      <div className="agenda-toolbar">
        <button type="button" className="icon-link" onClick={() => setWeekStart(addDaysStr(weekStart, -7))} aria-label="Semana anterior">
          <ChevronLeft size={16} />
        </button>
        <strong className="agenda-week-label">
          {formatDay(days[0])} – {formatDay(days[6])}
        </strong>
        <button type="button" className="icon-link" onClick={() => setWeekStart(addDaysStr(weekStart, 7))} aria-label="Semana siguiente">
          <ChevronRight size={16} />
        </button>
        <button type="button" className="secondary-button compact" onClick={() => setWeekStart(startOfWeekStr())}>
          Hoy
        </button>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="agenda-layout">
          <div className="agenda-backlog">
            <h3>Pedidos sin visita</h3>
            {ordersBacklog.length === 0 ? (
              <p className="agenda-empty-hint">Todo lo fabricado tiene ya una visita programada.</p>
            ) : (
              <div className="agenda-backlog-list">
                {ordersBacklog.map((o) => (
                  <DraggableCard key={`order-${o.salesOrderId}`} id={`card:order:${o.salesOrderId}`}>
                    <OrderCard order={o} />
                  </DraggableCard>
                ))}
              </div>
            )}
            {undatedInstallations.length > 0 && (
              <>
                <h3>Visitas sin fecha</h3>
                <div className="agenda-backlog-list">
                  {undatedInstallations.map((i) => (
                    <DraggableCard key={`undated-${i.id}`} id={`card:installation:${i.id}`} disabled={i.status !== 'SCHEDULED'}>
                      <InstallationCard inst={i} />
                    </DraggableCard>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="agenda-grid-scroll">
            <div className="agenda-grid">
              <div className="agenda-grid-corner" />
              {days.map((d) => (
                <div key={d} className={`agenda-day-head ${d === todayStr() ? 'is-today' : ''}`}>
                  {formatDay(d)}
                </div>
              ))}
              {lanes.map((lane) => (
                <Fragment key={lane.key}>
                  <div className="agenda-lane-label">
                    {lane.color && <span className="zone-dot" style={{ background: lane.color, display: 'inline-block' }} />}
                    {lane.label}
                  </div>
                  {days.map((d) => {
                    const items = weekInstallations.filter((i) => i.crewId === lane.crewId && i.scheduledDate === d);
                    return (
                      <DroppableCell key={`${lane.key}-${d}`} id={`cell:${lane.key}:${d}`}>
                        {items.map((i) => (
                          <DraggableCard key={i.id} id={`card:installation:${i.id}`} disabled={i.status !== 'SCHEDULED'}>
                            <InstallationCard inst={i} />
                          </DraggableCard>
                        ))}
                      </DroppableCell>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </DndContext>
    </div>
  );
}
