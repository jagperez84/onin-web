import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { listUsers } from '../core/userRepository';

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

export type InstallationStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

export type Installer = { id: number; name: string };

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
  salesOrderCode?: string | null;
  customerName?: string | null;
};

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
    salesOrderCode: row.sales_order?.code ?? null,
    customerName: row.sales_order?.customer?.party?.trade_name || row.sales_order?.customer?.party?.legal_name || null,
  };
}

const SELECT = 'id,company_id,sales_order_id,installation_type_id,scheduled_date,start_time,end_time,estimated_duration,actual_duration,installers,notes,status,created_at,updated_at,installation_type:installation_type_id(description),sales_order:sales_order_id(code,customer:customer_id(party:party_id(legal_name,trade_name)))';

export async function listInstallationTypes(companyId: number): Promise<InstallationType[]> {
  const c = client();
  const { data, error } = await c.from('installation_type').select('id,company_id,description,active').eq('company_id', companyId).eq('active', true).order('description');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map((r: any) => ({ id: Number(r.id), companyId: Number(r.company_id), description: r.description, active: Boolean(r.active) }));
}

export async function createInstallationType(companyId: number, description: string): Promise<InstallationType> {
  if (!description.trim()) throw new CoreRepositoryError('El tipo de montaje necesita una descripción.');
  const c = client();
  const { data, error } = await c.from('installation_type').insert({ company_id: companyId, description: description.trim() }).select('id,company_id,description,active').single();
  if (error) throw new CoreRepositoryError(error.message);
  return { id: Number(data.id), companyId: Number(data.company_id), description: data.description, active: Boolean(data.active) };
}

export async function listInstallers(companyId: number): Promise<Installer[]> {
  const users = await listUsers('', 'active');
  const scoped = users.filter(u => u.company_id === companyId);
  const installers = scoped.filter(u => u.role_code === 'INSTALLER');
  const source = installers.length ? installers : scoped;
  return source.map(u => ({ id: u.id, name: u.display_name || u.username }));
}

export async function getInstallationBySalesOrder(salesOrderId: number): Promise<Installation | null> {
  const c = client();
  const { data, error } = await c.from('installation').select(SELECT).eq('sales_order_id', salesOrderId).neq('status', 'CANCELLED').order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  return data ? mapInstallation(data) : null;
}

export type InstallationFilters = { companyId: number; status?: InstallationStatus | 'ALL'; from?: string; to?: string; search?: string };

export async function listInstallations(filters: InstallationFilters): Promise<Installation[]> {
  const c = client();
  let q = c.from('installation').select(SELECT).eq('company_id', filters.companyId).order('scheduled_date', { ascending: true, nullsFirst: false });
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
  };
  const query = input.id
    ? c.from('installation').update(payload).eq('id', input.id).select(SELECT).single()
    : c.from('installation').insert(payload).select(SELECT).single();
  const { data, error } = await query;
  if (error) throw new CoreRepositoryError(error.message);
  return mapInstallation(data);
}

export async function completeInstallation(id: number, endTime: string, actualDuration: string): Promise<void> {
  const c = client();
  const { error } = await c.rpc('complete_installation', { p_installation_id: id, p_end_time: endTime, p_actual_duration: actualDuration });
  if (error) throw new CoreRepositoryError(error.message);
}

export async function cancelInstallation(id: number): Promise<void> {
  const c = client();
  const { error } = await c.from('installation').update({ status: 'CANCELLED', updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}
