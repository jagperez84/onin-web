import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, GripVertical } from 'lucide-react';
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
  setInstallationRouteSequence,
  upsertInstallation,
  type Installation,
  type Installer,
  type OrderAwaitingInstallation,
} from '../../services/production/installationService';
import { listInstallationCrews, type InstallationCrew } from '../../services/production/installationCrewService';
import { MapCanvas, type CanvasPoint, type CanvasRoute } from '../map/MapCanvas';
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
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
/** Distancia en línea recta (no ruta real por carretera) — solo para avisar de saltos grandes entre paradas consecutivas. */
function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}
const DISTANCE_WARNING_KM = 30;

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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
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

  const dayInstallations = useMemo(
    () => (selectedDay ? allInstallations.filter((i) => i.scheduledDate === selectedDay) : []),
    [allInstallations, selectedDay]
  );
  const dayGroups = useMemo(
    () =>
      lanes.map((lane) => ({
        lane,
        items: dayInstallations
          .filter((i) => i.crewId === lane.crewId)
          .sort((a, b) => (a.routeSequence ?? 9999) - (b.routeSequence ?? 9999) || a.id - b.id),
      })),
    [lanes, dayInstallations]
  );
  const dayMapPoints: CanvasPoint[] = useMemo(() => {
    const pts: CanvasPoint[] = [];
    for (const { lane, items } of dayGroups) {
      items.forEach((inst, idx) => {
        if (inst.latitude == null || inst.longitude == null) return;
        pts.push({
          key: `inst-${inst.id}`,
          lat: inst.latitude,
          lon: inst.longitude,
          color: lane.color || '#8a6d3b',
          label: String(idx + 1),
          popupHtml: `<div class="map-popup"><strong>${escapeHtml(inst.salesOrderCode || `#${inst.salesOrderId}`)}</strong><span>${escapeHtml(inst.customerName || '—')}</span><span class="map-popup-status">${escapeHtml(lane.label)}</span></div>`,
        });
      });
    }
    return pts;
  }, [dayGroups]);
  const dayMapRoutes: CanvasRoute[] = useMemo(
    () =>
      dayGroups
        .filter((g) => g.items.length > 1)
        .map((g) => ({
          color: g.lane.color || '#8a6d3b',
          keys: g.items.filter((i) => i.latitude != null && i.longitude != null).map((i) => `inst-${i.id}`),
        })),
    [dayGroups]
  );

  async function reorderWithinCrew(crewId: number | null, installationId: number, direction: -1 | 1) {
    const group = dayInstallations
      .filter((i) => i.crewId === crewId)
      .sort((a, b) => (a.routeSequence ?? 9999) - (b.routeSequence ?? 9999) || a.id - b.id);
    const idx = group.findIndex((i) => i.id === installationId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= group.length || companyId == null) return;
    const reordered = [...group];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setBusy(true);
    setError('');
    try {
      await Promise.all(reordered.map((inst, i) => setInstallationRouteSequence(inst.id, i)));
      await loadAll(companyId);
    } catch (e) {
      setError(e instanceof CoreRepositoryError ? e.message : 'No se pudo reordenar la ruta.');
    } finally {
      setBusy(false);
    }
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
      {selectedDay ? (
        <div className="agenda-toolbar">
          <button type="button" className="secondary-button compact" onClick={() => setSelectedDay(null)}>
            <ArrowLeft size={14} /> Volver a la semana
          </button>
          <button type="button" className="icon-link" onClick={() => setSelectedDay(addDaysStr(selectedDay, -1))} aria-label="Día anterior">
            <ChevronLeft size={16} />
          </button>
          <strong className="agenda-week-label">{formatDayLong(selectedDay)}</strong>
          <button type="button" className="icon-link" onClick={() => setSelectedDay(addDaysStr(selectedDay, 1))} aria-label="Día siguiente">
            <ChevronRight size={16} />
          </button>
        </div>
      ) : (
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
      )}

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

          {selectedDay ? (
            <div className="agenda-day-split">
              <div className="agenda-day-list">
                {dayGroups.map(({ lane, items }) => (
                  <div key={lane.key} className="agenda-day-crew-group">
                    <div className="agenda-lane-label">
                      {lane.color && <span className="zone-dot" style={{ background: lane.color, display: 'inline-block' }} />}
                      {lane.label}
                    </div>
                    <DroppableCell id={`cell:${lane.key}:${selectedDay}`}>
                      {items.length === 0 && <span className="agenda-empty-hint">Sin visitas este día.</span>}
                      {items.map((inst, idx) => {
                        const prev = items[idx - 1];
                        const dist =
                          prev && prev.latitude != null && prev.longitude != null && inst.latitude != null && inst.longitude != null
                            ? haversineKm({ lat: prev.latitude, lon: prev.longitude }, { lat: inst.latitude, lon: inst.longitude })
                            : null;
                        return (
                          <div key={inst.id} className="agenda-day-row">
                            <span className="agenda-day-row-seq">{idx + 1}</span>
                            <DraggableCard id={`card:installation:${inst.id}`} disabled={inst.status !== 'SCHEDULED'}>
                              <InstallationCard inst={inst} />
                            </DraggableCard>
                            <div className="agenda-day-row-controls">
                              <button
                                type="button"
                                className="icon-link"
                                disabled={idx === 0 || busy}
                                onClick={() => void reorderWithinCrew(lane.crewId, inst.id, -1)}
                                aria-label="Subir en el orden de ruta"
                              >
                                <ChevronUp size={13} />
                              </button>
                              <button
                                type="button"
                                className="icon-link"
                                disabled={idx === items.length - 1 || busy}
                                onClick={() => void reorderWithinCrew(lane.crewId, inst.id, 1)}
                                aria-label="Bajar en el orden de ruta"
                              >
                                <ChevronDown size={13} />
                              </button>
                            </div>
                            {dist != null && dist > DISTANCE_WARNING_KM && (
                              <span className="agenda-distance-warning">
                                <AlertTriangle size={12} /> {Math.round(dist)} km desde la parada anterior (línea recta)
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </DroppableCell>
                  </div>
                ))}
              </div>
              <div className="agenda-day-map">
                <MapCanvas points={dayMapPoints} routes={dayMapRoutes} />
              </div>
            </div>
          ) : (
            <div className="agenda-grid-scroll">
              <div className="agenda-grid">
                <div className="agenda-grid-corner" />
                {days.map((d) => (
                  <button
                    type="button"
                    key={d}
                    className={`agenda-day-head ${d === todayStr() ? 'is-today' : ''}`}
                    onClick={() => setSelectedDay(d)}
                    title="Ver el mapa y el orden de ruta de este día"
                  >
                    {formatDay(d)}
                  </button>
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
          )}
        </div>
      </DndContext>
    </div>
  );
}
