import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { listUsers } from '../core/userRepository';
import { getSalesOrderDeliveryStatus } from '../sales/deliveryNoteService';

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export async function resolveCurrentCompanyId(): Promise<number> {
  const c = client();
  const { data: { user }, error: ue } = await c.auth.getUser();
  if (ue || !user) throw new CoreRepositoryError('No hay un usuario autenticado.');
  const { data, error } = await c.from('user_account').select('company_id').eq('auth_user_id', user.id).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  if (data?.company_id == null) throw new CoreRepositoryError('El usuario no tiene empresa asignada.');
  return Number(data.company_id);
}

export type InstallationType = { id: number; companyId: number; description: string; active: boolean };

export type InstallationStatus = 'SCHEDULED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED' | 'CANCELLED';

export const INSTALLATION_STATUS_LABEL: Record<InstallationStatus, string> = {
  SCHEDULED: 'Programado',
  IN_PROGRESS: 'En curso',
  BLOCKED: 'Bloqueado por incidencia',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};

/** Tono para `.status-pill` / `.lifecycle-*` — sin modificador para SCHEDULED (info). */
export const INSTALLATION_STATUS_TONE: Record<InstallationStatus, string> = {
  SCHEDULED: '',
  IN_PROGRESS: 'warning',
  BLOCKED: 'danger',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export type Installer = { id: number; name: string };

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type IncidentStatus = 'OPEN' | 'RESOLVED';

export type InstallationSession = {
  id: number;
  installationId: number;
  sessionDate: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  createdAt: string;
};

export type InstallationIncident = {
  id: number;
  installationId: number;
  sessionId: number | null;
  severity: IncidentSeverity;
  description: string;
  status: IncidentStatus;
  reportedAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
};

export type Installation = {
  id: number;
  companyId: number;
  salesOrderId: number;
  installationTypeId: number | null;
  installationTypeDescription: string | null;
  scheduledDate: string | null;
  startTime: string | null;
  endTime: string | null;
  estimatedDuration: string | null;
  actualDuration: string | null;
  installers: Installer[];
  notes: string | null;
  status: InstallationStatus;
  createdAt: string;
  updatedAt: string;
  /** Cuadrilla asignada, si la hay — installers sigue siendo la lista real de quién va a esta visita. */
  crewId: number | null;
  crewName?: string | null;
  crewColor?: string | null;
  salesOrderCode?: string | null;
  customerName?: string | null;
  /** Líneas del pedido (sales_order_line.id) que cubre esta visita de montaje. */
  lineIds: number[];
  /** Jornadas de trabajo registradas — un montaje grande puede necesitar varios días. */
  sessions: InstallationSession[];
  /** Incidencias registradas durante el montaje, resueltas o no. */
  incidents: InstallationIncident[];
};

function mapSession(row: any): InstallationSession {
  return {
    id: Number(row.id),
    installationId: Number(row.installation_id),
    sessionDate: row.session_date,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
}

function mapIncident(row: any): InstallationIncident {
  return {
    id: Number(row.id),
    installationId: Number(row.installation_id),
    sessionId: row.session_id == null ? null : Number(row.session_id),
    severity: row.severity,
    description: row.description,
    status: row.status,
    reportedAt: row.reported_at,
    resolvedAt: row.resolved_at ?? null,
    resolutionNotes: row.resolution_notes ?? null,
  };
}

function mapInstallation(row: any): Installation {
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    salesOrderId: Number(row.sales_order_id),
    installationTypeId: row.installation_type_id == null ? null : Number(row.installation_type_id),
    installationTypeDescription: row.installation_type?.description ?? null,
    scheduledDate: row.scheduled_date ?? null,
    startTime: row.start_time ?? null,
    endTime: row.end_time ?? null,
    estimatedDuration: row.estimated_duration ?? null,
    actualDuration: row.actual_duration ?? null,
    installers: Array.isArray(row.installers) ? row.installers : [],
    notes: row.notes ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    crewId: row.crew_id == null ? null : Number(row.crew_id),
    crewName: row.crew?.name ?? null,
    crewColor: row.crew?.color ?? null,
    salesOrderCode: row.sales_order?.code ?? null,
    customerName: row.sales_order?.customer?.party?.trade_name || row.sales_order?.customer?.party?.legal_name || null,
    lineIds: Array.isArray(row.lines) ? row.lines.map((l: any) => Number(l.sales_order_line_id)) : [],
    sessions: (Array.isArray(row.sessions) ? row.sessions : []).map(mapSession).sort((a: InstallationSession, b: InstallationSession) => a.sessionDate.localeCompare(b.sessionDate)),
    incidents: (Array.isArray(row.incidents) ? row.incidents : []).map(mapIncident).sort((a: InstallationIncident, b: InstallationIncident) => b.reportedAt.localeCompare(a.reportedAt)),
  };
}

const SELECT =
  'id,company_id,sales_order_id,installation_type_id,scheduled_date,start_time,end_time,estimated_duration,actual_duration,installers,notes,status,created_at,updated_at,crew_id,' +
  'crew:crew_id(name,color),' +
  'installation_type:installation_type_id(description),sales_order:sales_order_id(code,customer:customer_id(party:party_id(legal_name,trade_name))),' +
  'lines:installation_line(sales_order_line_id),' +
  'sessions:installation_session(id,installation_id,session_date,start_time,end_time,notes,created_at),' +
  'incidents:installation_incident(id,installation_id,session_id,severity,description,status,reported_at,resolved_at,resolution_notes)';

export async function listInstallationTypes(companyId: number): Promise<InstallationType[]> {
  const c = client();
  const { data, error } = await c.from('installation_type').select('id,company_id,description,active').eq('company_id', companyId).eq('active', true).order('description');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map((r: any) => ({ id: Number(r.id), companyId: Number(r.company_id), description: r.description, active: Boolean(r.active) }));
}

export async function listInstallers(companyId: number): Promise<Installer[]> {
  const users = await listUsers('', 'active');
  const scoped = users.filter(u => u.company_id === companyId);
  const installers = scoped.filter(u => u.role_code === 'INSTALLER');
  const source = installers.length ? installers : scoped;
  return source.map(u => ({ id: u.id, name: u.display_name || u.username }));
}

/** Candidatos a formar parte de una cuadrilla: instaladores y cualquiera marcado como medidor — en una pyme la misma persona suele hacer ambas cosas. */
export async function listFieldStaff(companyId: number): Promise<Installer[]> {
  const users = await listUsers('', 'active');
  return users
    .filter(u => u.company_id === companyId && (u.role_code === 'INSTALLER' || u.can_measure))
    .map(u => ({ id: u.id, name: u.display_name || u.username }));
}

/** Todas las visitas de montaje activas (no canceladas) de un pedido — puede haber varias, cada una cubriendo líneas distintas. */
export async function listInstallationsBySalesOrder(salesOrderId: number): Promise<Installation[]> {
  const c = client();
  const { data, error } = await c.from('installation').select(SELECT).eq('sales_order_id', salesOrderId).neq('status', 'CANCELLED').order('id', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map(mapInstallation);
}

export type InstallationSortField = 'scheduled_date' | 'created_at';

export type InstallationFilters = { companyId: number; status?: InstallationStatus | 'ALL'; from?: string; to?: string; search?: string; sortBy?: InstallationSortField; ascending?: boolean };

export async function listInstallations(filters: InstallationFilters): Promise<Installation[]> {
  const c = client();
  let q = c.from('installation').select(SELECT).eq('company_id', filters.companyId).order(filters.sortBy ?? 'scheduled_date', { ascending: filters.ascending ?? true, nullsFirst: false });
  if (filters.status && filters.status !== 'ALL') q = q.eq('status', filters.status);
  if (filters.from) q = q.gte('scheduled_date', filters.from);
  if (filters.to) q = q.lte('scheduled_date', filters.to);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  let rows = (data ?? []).map(mapInstallation);
  const term = filters.search?.trim().toLowerCase();
  if (term) {
    rows = rows.filter(r => (r.salesOrderCode || '').toLowerCase().includes(term) || (r.customerName || '').toLowerCase().includes(term));
  }
  return rows;
}

export async function upsertInstallation(input: {
  id?: number | null;
  companyId: number;
  salesOrderId: number;
  installationTypeId: number | null;
  scheduledDate: string | null;
  startTime: string | null;
  estimatedDuration: string | null;
  installers: Installer[];
  notes: string | null;
  /** Cuadrilla de referencia para esta visita — installers puede seguir ajustándose a mano. */
  crewId?: number | null;
  /** Líneas del pedido que cubre esta visita. Solo se aplica al crear; no se puede reasignar después. */
  salesOrderLineIds?: number[];
}): Promise<Installation> {
  const c = client();
  const payload = {
    company_id: input.companyId,
    sales_order_id: input.salesOrderId,
    installation_type_id: input.installationTypeId,
    scheduled_date: input.scheduledDate,
    start_time: input.startTime,
    estimated_duration: input.estimatedDuration,
    installers: input.installers,
    notes: input.notes,
    crew_id: input.crewId ?? null,
  };
  if (input.id) {
    const { data, error } = await c.from('installation').update(payload).eq('id', input.id).select(SELECT).single();
    if (error) throw new CoreRepositoryError(error.message);
    return mapInstallation(data);
  }
  const { data: created, error: createError } = await c.from('installation').insert({ ...payload, status: 'SCHEDULED' }).select(SELECT).single();
  if (createError) throw new CoreRepositoryError(createError.message);
  const createdId = (created as any).id;
  const lineIds = input.salesOrderLineIds ?? [];
  if (lineIds.length) {
    const { error: linesError } = await c.from('installation_line').insert(lineIds.map((id) => ({ installation_id: createdId, sales_order_line_id: id })));
    if (linesError) throw new CoreRepositoryError(linesError.message);
  }
  const { data, error } = await c.from('installation').select(SELECT).eq('id', createdId).single();
  if (error) throw new CoreRepositoryError(error.message);
  return mapInstallation(data);
}

/** Completa la instalación y genera su albarán (solo con las líneas que cubre). Devuelve el id del albarán generado, o null si no tenía líneas asignadas. */
export async function completeInstallation(id: number, endTime: string, actualDuration: string): Promise<number | null> {
  const c = client();
  const { data, error } = await c.rpc('complete_installation', { p_installation_id: id, p_end_time: endTime, p_actual_duration: actualDuration });
  if (error) throw new CoreRepositoryError(error.message);
  return data == null ? null : Number(data);
}

export async function cancelInstallation(id: number): Promise<void> {
  const c = client();
  const { error } = await c.from('installation').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}

/** Registra una jornada de trabajo de un montaje multi-día. Pone la instalación en curso si estaba programada o bloqueada. */
export async function addInstallationSession(input: {
  installationId: number;
  sessionDate: string;
  startTime?: string | null;
  endTime?: string | null;
  notes?: string | null;
}): Promise<number> {
  const c = client();
  const { data, error } = await c.rpc('add_installation_session', {
    p_installation_id: input.installationId,
    p_session_date: input.sessionDate,
    p_start_time: input.startTime ?? null,
    p_end_time: input.endTime ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw new CoreRepositoryError(error.message);
  return Number(data);
}

/** Reporta que algo ha salido mal durante el montaje. Una incidencia grave (HIGH) bloquea la instalación. */
export async function reportInstallationIncident(input: {
  installationId: number;
  severity: IncidentSeverity;
  description: string;
  sessionId?: number | null;
}): Promise<number> {
  const c = client();
  const { data, error } = await c.rpc('report_installation_incident', {
    p_installation_id: input.installationId,
    p_severity: input.severity,
    p_description: input.description,
    p_session_id: input.sessionId ?? null,
  });
  if (error) throw new CoreRepositoryError(error.message);
  return Number(data);
}

export async function resolveInstallationIncident(incidentId: number, resolutionNotes?: string): Promise<void> {
  const c = client();
  const { error } = await c.rpc('resolve_installation_incident', { p_incident_id: incidentId, p_resolution_notes: resolutionNotes ?? null });
  if (error) throw new CoreRepositoryError(error.message);
}

/** Vuelve a cargar una instalación concreta con sus jornadas e incidencias al día. */
export async function getInstallation(id: number): Promise<Installation | null> {
  const c = client();
  const { data, error } = await c.from('installation').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  return data ? mapInstallation(data) : null;
}

export type OrderAwaitingInstallation = {
  salesOrderId: number;
  code: string;
  customerName: string | null;
  lineIds: number[];
  linesLabel: string;
};

/**
 * Pedidos fabricados que todavía no tienen ninguna visita de montaje activa cubriendo
 * sus líneas OTD pendientes — el backlog de la Agenda. Hace una llamada por pedido
 * (delivery status + instalaciones) porque son pocos a la vez en una pyme de este
 * tamaño; no vale la pena una vista SQL solo para esto.
 */
export async function listOrdersAwaitingInstallation(companyId: number): Promise<OrderAwaitingInstallation[]> {
  const c = client();
  const { data, error } = await c
    .from('sales_order')
    .select('id,code,customer:customer_id(party:party_id(legal_name,trade_name)),lines:sales_order_line(id,line_no,description)')
    .eq('company_id', companyId)
    .eq('status', 'MANUFACTURED')
    .order('id', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);

  const results: OrderAwaitingInstallation[] = [];
  for (const row of (data ?? []) as any[]) {
    const [deliveryStatus, installations] = await Promise.all([
      getSalesOrderDeliveryStatus(Number(row.id)).catch(() => []),
      listInstallationsBySalesOrder(Number(row.id)).catch(() => []),
    ]);
    const coveredLineIds = new Set(installations.filter((i) => i.status !== 'CANCELLED').flatMap((i) => i.lineIds));
    const pending = deliveryStatus.filter((s) => s.isOtd && s.remainingQuantity > 0 && !coveredLineIds.has(s.salesOrderLineId));
    if (pending.length === 0) continue;
    const lines = (row.lines ?? []) as any[];
    const customer = one(row.customer);
    const party = one((customer as any)?.party);
    results.push({
      salesOrderId: Number(row.id),
      code: row.code,
      customerName: party?.trade_name || party?.legal_name || null,
      lineIds: pending.map((p) => p.salesOrderLineId),
      linesLabel: pending
        .map((p) => {
          const line = lines.find((l) => Number(l.id) === p.salesOrderLineId);
          return `#${p.lineNo}${line?.description ? ' · ' + line.description : ''}`;
        })
        .join(', '),
    });
  }
  return results;
}
