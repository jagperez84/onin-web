import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CloudRain, GripVertical, Wind } from 'lucide-react';
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
import { fetchDailyForecast, isWeatherRisk, locationKey, WEATHER_RISK_WIND_KMH, type DayForecast } from '../../services/geo/weatherService';
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

function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
function minutesToTime(mins: number): string {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = Math.round(wrapped % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
/** Interpreta duraciones en texto libre ("2h", "1h30", "90min", "1,5h") → horas decimales. Devuelve null si no se reconoce el formato. */
function parseDurationHours(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = text.trim().toLowerCase().replace(',', '.');
  let m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:oras?)?\s*(\d+)?\s*(?:min(?:utos?)?)?$/);
  if (m) return parseFloat(m[1]) + (m[2] ? parseInt(m[2], 10) / 60 : 0);
  m = s.match(/^(\d+)\s*min(?:utos?)?$/);
  if (m) return parseInt(m[1], 10) / 60;
  m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return parseFloat(m[1]);
  return null;
}
/** Duración a aplicar cuando no hay ninguna estimación registrada — solo afecta al tamaño del bloque en el mapa del día. */
const DEFAULT_DURATION_HOURS = 2;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 20;
const PX_PER_HOUR = 52;
const TRACK_HEIGHT = (DAY_END_HOUR - DAY_START_HOUR) * PX_PER_HOUR;

type Lane = { key: string; label: string; color: string | null; crewId: number | null };

/**
 * Una "aparición" de un montaje en un día concreto. Un montaje sin jornadas registradas
 * (SCHEDULED, aún no empezado) aparece una vez, en su scheduledDate. Un montaje con
 * jornadas (IN_PROGRESS/BLOCKED/COMPLETED, ya se ha trabajado) aparece una vez por cada
 * jornada, en la fecha y horario de esa jornada — así un montaje de varios días se ve
 * en todos los días que ocupa, no solo en el primero.
 */
type DayAppearance = {
  key: string;
  installation: Installation;
  date: string;
  startMinutes: number | null;
  durationHours: number;
  sessionLabel: string | null;
};

function timeRangeLabel(a: Pick<DayAppearance, 'startMinutes' | 'durationHours'>): string | null {
  if (a.startMinutes == null) return null;
  return `${minutesToTime(a.startMinutes)}–${minutesToTime(a.startMinutes + a.durationHours * 60)}`;
}

function compareAppearances(a: DayAppearance, b: DayAppearance): number {
  const aHas = a.startMinutes != null;
  const bHas = b.startMinutes != null;
  if (aHas && bHas) return (a.startMinutes as number) - (b.startMinutes as number) || a.installation.id - b.installation.id;
  if (aHas !== bHas) return aHas ? -1 : 1;
  return (a.installation.routeSequence ?? 9999) - (b.installation.routeSequence ?? 9999) || a.installation.id - b.installation.id;
}

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

function DayLaneDrop({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`agenda-day-lane-drop ${isOver ? 'is-over' : ''}`}>
      {children}
    </div>
  );
}

function InstallationCard({ inst, timeLabel, sessionLabel }: { inst: Installation; timeLabel?: string | null; sessionLabel?: string | null }) {
  const hasOpenIncident = inst.incidents.some((i) => i.status === 'OPEN');
  return (
    <Link to={`/ventas/pedidos/${inst.salesOrderId}`} className="agenda-card-link">
      <span className="agenda-card-head">
        <GripVertical size={12} />
        {timeLabel && <strong>{timeLabel}</strong>}
        <span className={`status-pill ${INSTALLATION_STATUS_TONE[inst.status]}`}>{INSTALLATION_STATUS_LABEL[inst.status]}</span>
      </span>
      <span className="agenda-card-title">{inst.salesOrderCode || `#${inst.salesOrderId}`}</span>
      <span className="agenda-card-sub">{inst.customerName || '—'}</span>
      {sessionLabel && <span className="agenda-card-session">{sessionLabel}</span>}
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

/** Bloque posicionado en el eje horario — su alto es proporcional a la duración prevista. */
function TimeBlock({ appearance, distanceWarningKm }: { appearance: DayAppearance; distanceWarningKm: number | null }) {
  const inst = appearance.installation;
  const disabled = inst.status !== 'SCHEDULED';
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `card:installation:${inst.id}`, disabled });
  const hasOpenIncident = inst.incidents.some((i) => i.status === 'OPEN');
  const top = Math.max(0, ((appearance.startMinutes as number) / 60 - DAY_START_HOUR) * PX_PER_HOUR);
  const height = Math.max(appearance.durationHours * PX_PER_HOUR, 24);
  const style: CSSProperties = {
    top,
    height,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    zIndex: isDragging ? 60 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={`agenda-time-block ${disabled ? 'not-draggable' : ''} ${isDragging ? 'is-dragging' : ''}`}>
      <Link to={`/ventas/pedidos/${inst.salesOrderId}`} className="agenda-card-link">
        <span className="agenda-card-head">
          <strong>{timeRangeLabel(appearance)}</strong>
          {distanceWarningKm != null && (
            <span title={`${Math.round(distanceWarningKm)} km desde la parada anterior (línea recta)`}>
              <AlertTriangle size={11} color="var(--status-warning-fg)" />
            </span>
          )}
        </span>
        <span className="agenda-card-title">{inst.salesOrderCode || `#${inst.salesOrderId}`}</span>
        <span className="agenda-card-sub">{inst.customerName || '—'}</span>
        {appearance.sessionLabel && <span className="agenda-card-session">{appearance.sessionLabel}</span>}
        {hasOpenIncident && <span className="status-pill danger">Incidencia</span>}
      </Link>
    </div>
  );
}

function HourRuler() {
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);
  return (
    <div className="agenda-hour-ruler" style={{ height: TRACK_HEIGHT }}>
      {hours.map((h) => (
        <div key={h} className="agenda-hour-mark" style={{ top: (h - DAY_START_HOUR) * PX_PER_HOUR }}>
          {String(h).padStart(2, '0')}:00
        </div>
      ))}
    </div>
  );
}

/** Aviso de tiempo — solo se pinta cuando hay riesgo real (lluvia o viento fuerte); si el día pinta bien, no hay nada que mostrar. */
function WeatherBadge({ forecast }: { forecast: DayForecast }) {
  const rain = Math.round(forecast.precipitationProbabilityMax ?? 0);
  const wind = Math.round(forecast.windSpeedMaxKmh ?? 0);
  const windIsWorse = wind >= WEATHER_RISK_WIND_KMH && wind > rain;
  return (
    <span className="weather-badge" title={`Previsión: ${rain}% de probabilidad de lluvia, viento hasta ${wind} km/h`}>
      {windIsWorse ? <Wind size={11} /> : <CloudRain size={11} />}
      {windIsWorse ? `${wind} km/h` : `${rain}%`}
    </span>
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
  const [forecastByKey, setForecastByKey] = useState<Map<string, DayForecast>>(new Map());

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

  async function loadForecastFor(points: { lat: number; lon: number }[], from: string, to: string) {
    if (points.length === 0) return;
    const fetched = await fetchDailyForecast(points, from, to);
    if (fetched.size === 0) return;
    setForecastByKey((prev) => {
      const next = new Map(prev);
      for (const [key, value] of fetched) next.set(key, value);
      return next;
    });
  }

  function coordsOf(list: { installation: Installation }[]): { lat: number; lon: number }[] {
    return list
      .map((a) => a.installation)
      .filter((i) => i.latitude != null && i.longitude != null)
      .map((i) => ({ lat: i.latitude as number, lon: i.longitude as number }));
  }

  // Una entrada por cada día que ocupa un montaje: la fecha planificada si aún no
  // empezó, o una por cada jornada de trabajo registrada si ya lleva varias visitas.
  const appearances: DayAppearance[] = useMemo(() => {
    const list: DayAppearance[] = [];
    for (const inst of allInstallations) {
      if (inst.sessions.length > 0) {
        inst.sessions.forEach((s, idx) => {
          const start = timeToMinutes(s.startTime);
          const end = timeToMinutes(s.endTime);
          const duration = start != null && end != null && end > start ? (end - start) / 60 : parseDurationHours(inst.estimatedDuration) ?? DEFAULT_DURATION_HOURS;
          list.push({
            key: `inst-${inst.id}-session-${s.id}`,
            installation: inst,
            date: s.sessionDate,
            startMinutes: start,
            durationHours: duration,
            sessionLabel: inst.sessions.length > 1 ? `Jornada ${idx + 1} de ${inst.sessions.length}` : null,
          });
        });
      } else if (inst.scheduledDate) {
        list.push({
          key: `inst-${inst.id}-planned`,
          installation: inst,
          date: inst.scheduledDate,
          startMinutes: timeToMinutes(inst.startTime),
          durationHours: parseDurationHours(inst.estimatedDuration) ?? DEFAULT_DURATION_HOURS,
          sessionLabel: null,
        });
      }
    }
    return list;
  }, [allInstallations]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i)), [weekStart]);
  const weekEnd = days[6];
  const weekAppearances = useMemo(() => appearances.filter((a) => a.date >= weekStart && a.date <= weekEnd), [appearances, weekStart, weekEnd]);
  useEffect(() => {
    if (selectedDay) return; // en modo día se encarga el otro efecto, con rango más ajustado
    void loadForecastFor(coordsOf(weekAppearances), weekStart, weekEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, weekEnd, selectedDay, allInstallations]);
  // Un montaje que ya tiene alguna jornada registrada no está "sin fecha" aunque
  // scheduledDate quedara vacío — sus jornadas son las fechas reales que importan.
  const undatedInstallations = useMemo(() => allInstallations.filter((i) => !i.scheduledDate && i.sessions.length === 0), [allInstallations]);
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

  const dayAppearances = useMemo(() => (selectedDay ? appearances.filter((a) => a.date === selectedDay) : []), [appearances, selectedDay]);
  useEffect(() => {
    if (!selectedDay) return;
    void loadForecastFor(coordsOf(dayAppearances), selectedDay, selectedDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, allInstallations]);
  function forecastFor(inst: Installation, date: string): DayForecast | undefined {
    if (inst.latitude == null || inst.longitude == null) return undefined;
    return forecastByKey.get(`${locationKey(inst.latitude, inst.longitude)}|${date}`);
  }
  /** El peor aviso entre las paradas de una cuadrilla ese día — basta con una parada mal para avisar. */
  function worstForecast(items: DayAppearance[]): DayForecast | null {
    let worst: DayForecast | null = null;
    for (const a of items) {
      const f = forecastFor(a.installation, a.date);
      if (isWeatherRisk(f) && (!worst || (f?.precipitationProbabilityMax ?? 0) > (worst.precipitationProbabilityMax ?? 0))) worst = f ?? null;
    }
    return worst;
  }
  const dayGroups = useMemo(
    () =>
      lanes.map((lane) => {
        const items = dayAppearances.filter((a) => a.installation.crewId === lane.crewId).sort(compareAppearances);
        return { lane, items, timed: items.filter((a) => a.startMinutes != null), untimed: items.filter((a) => a.startMinutes == null) };
      }),
    [lanes, dayAppearances]
  );
  const dayMapPoints: CanvasPoint[] = useMemo(() => {
    const pts: CanvasPoint[] = [];
    for (const { lane, items } of dayGroups) {
      items.forEach((a, idx) => {
        const inst = a.installation;
        if (inst.latitude == null || inst.longitude == null) return;
        pts.push({
          key: `pt-${a.key}`,
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
          keys: g.items.filter((a) => a.installation.latitude != null && a.installation.longitude != null).map((a) => `pt-${a.key}`),
        })),
    [dayGroups]
  );

  function distanceFromPrevious(items: DayAppearance[], idx: number): number | null {
    const prev = items[idx - 1];
    const cur = items[idx];
    if (!prev || !cur) return null;
    const a = prev.installation;
    const b = cur.installation;
    if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) return null;
    return haversineKm({ lat: a.latitude, lon: a.longitude }, { lat: b.latitude, lon: b.longitude });
  }

  async function reorderWithinCrew(crewId: number | null, installationId: number, direction: -1 | 1) {
    const group = dayAppearances
      .filter((a) => a.installation.crewId === crewId && a.startMinutes == null)
      .map((a) => a.installation)
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
                      <InstallationCard inst={i} timeLabel={i.startTime} />
                    </DraggableCard>
                  ))}
                </div>
              </>
            )}
          </div>

          {selectedDay ? (
            <div className="agenda-day-split">
              <div className="agenda-day-schedule">
                <div className="agenda-hour-ruler-col">
                  <div className="agenda-day-track-head">&nbsp;</div>
                  <HourRuler />
                </div>
                {dayGroups.map(({ lane, items, timed, untimed }) => {
                  const risk = worstForecast(items);
                  return (
                  <div key={lane.key} className="agenda-day-lane-column">
                    <div className="agenda-day-track-head">
                      {lane.color && <span className="zone-dot" style={{ background: lane.color, display: 'inline-block' }} />}
                      {lane.label}
                      {risk && <WeatherBadge forecast={risk} />}
                    </div>
                    <DayLaneDrop id={`cell:${lane.key}:${selectedDay}`}>
                      <div
                        className="agenda-day-track"
                        style={{
                          height: TRACK_HEIGHT,
                          backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${PX_PER_HOUR}px)`,
                        }}
                      >
                        {timed.map((a, idx) => {
                          const dist = distanceFromPrevious(timed, idx);
                          return <TimeBlock key={a.key} appearance={a} distanceWarningKm={dist != null && dist > DISTANCE_WARNING_KM ? dist : null} />;
                        })}
                      </div>
                      {untimed.length > 0 && (
                        <div className="agenda-day-untimed">
                          <span className="agenda-untimed-label">Sin hora asignada</span>
                          {untimed.map((a, idx) => {
                            const dist = distanceFromPrevious(untimed, idx);
                            return (
                              <div key={a.key} className="agenda-day-row">
                                <span className="agenda-day-row-seq">{timed.length + idx + 1}</span>
                                <DraggableCard id={`card:installation:${a.installation.id}`} disabled={a.installation.status !== 'SCHEDULED'}>
                                  <InstallationCard inst={a.installation} sessionLabel={a.sessionLabel} />
                                </DraggableCard>
                                <div className="agenda-day-row-controls">
                                  <button
                                    type="button"
                                    className="icon-link"
                                    disabled={idx === 0 || busy}
                                    onClick={() => void reorderWithinCrew(lane.crewId, a.installation.id, -1)}
                                    aria-label="Subir en el orden de ruta"
                                  >
                                    <ChevronUp size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-link"
                                    disabled={idx === untimed.length - 1 || busy}
                                    onClick={() => void reorderWithinCrew(lane.crewId, a.installation.id, 1)}
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
                        </div>
                      )}
                      {timed.length === 0 && untimed.length === 0 && <span className="agenda-empty-hint">Sin visitas este día.</span>}
                    </DayLaneDrop>
                  </div>
                  );
                })}
              </div>
              <div className="agenda-day-map">
                <MapCanvas points={dayMapPoints} routes={dayMapRoutes} />
              </div>
            </div>
          ) : (
            <div className="agenda-grid-scroll">
              <div className="agenda-grid">
                <div className="agenda-grid-corner" />
                {days.map((d) => {
                  const risk = worstForecast(weekAppearances.filter((a) => a.date === d));
                  return (
                    <button
                      type="button"
                      key={d}
                      className={`agenda-day-head ${d === todayStr() ? 'is-today' : ''}`}
                      onClick={() => setSelectedDay(d)}
                      title={risk ? `Aviso de tiempo: ${Math.round(risk.precipitationProbabilityMax ?? 0)}% de lluvia, viento hasta ${Math.round(risk.windSpeedMaxKmh ?? 0)} km/h` : 'Ver el mapa y el orden de ruta de este día'}
                    >
                      {formatDay(d)}
                      {risk && <CloudRain size={11} className="agenda-day-head-weather" />}
                    </button>
                  );
                })}
                {lanes.map((lane) => (
                  <Fragment key={lane.key}>
                    <div className="agenda-lane-label">
                      {lane.color && <span className="zone-dot" style={{ background: lane.color, display: 'inline-block' }} />}
                      {lane.label}
                    </div>
                    {days.map((d) => {
                      const items = weekAppearances.filter((a) => a.installation.crewId === lane.crewId && a.date === d).sort(compareAppearances);
                      return (
                        <DroppableCell key={`${lane.key}-${d}`} id={`cell:${lane.key}:${d}`}>
                          {items.map((a) => (
                            <DraggableCard key={a.key} id={`card:installation:${a.installation.id}`} disabled={a.installation.status !== 'SCHEDULED'}>
                              <InstallationCard inst={a.installation} timeLabel={timeRangeLabel(a)} sessionLabel={a.sessionLabel} />
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
