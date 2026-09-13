import { supabase } from '../../lib/supabase';
import { CoreRepositoryError, getCurrentCompanyId } from '../core/coreRepository';

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export type InstallationCrew = {
  id: number;
  companyId: number;
  name: string;
  color: string;
  memberIds: number[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

function mapCrew(row: any): InstallationCrew {
  return {
    id: Number(row.id),
    companyId: Number(row.company_id),
    name: row.name,
    color: row.color,
    memberIds: Array.isArray(row.member_ids) ? row.member_ids.map(Number) : [],
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = 'id,company_id,name,color,member_ids,active,created_at,updated_at';

export async function listInstallationCrews(status: 'active' | 'inactive' | 'all' = 'active'): Promise<InstallationCrew[]> {
  const c = client();
  const cid = await getCurrentCompanyId();
  let q = c.from('installation_crew').select(SELECT).eq('company_id', cid).order('name');
  if (status === 'active') q = q.is('deleted_at', null);
  else if (status === 'inactive') q = q.not('deleted_at', 'is', null);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map(mapCrew);
}

export async function createInstallationCrew(input: { name: string; color: string; memberIds: number[] }): Promise<InstallationCrew> {
  const c = client();
  const cid = await getCurrentCompanyId();
  const { data, error } = await c
    .from('installation_crew')
    .insert({ company_id: cid, name: input.name.trim(), color: input.color, member_ids: input.memberIds })
    .select(SELECT)
    .single();
  if (error) throw new CoreRepositoryError(error.message);
  return mapCrew(data);
}

export async function updateInstallationCrew(id: number, changes: { name?: string; color?: string; memberIds?: number[] }): Promise<InstallationCrew> {
  const c = client();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (changes.name !== undefined) payload.name = changes.name.trim();
  if (changes.color !== undefined) payload.color = changes.color;
  if (changes.memberIds !== undefined) payload.member_ids = changes.memberIds;
  const { data, error } = await c.from('installation_crew').update(payload).eq('id', id).select(SELECT).single();
  if (error) throw new CoreRepositoryError(error.message);
  return mapCrew(data);
}

export async function markInstallationCrewForDeletion(id: number): Promise<void> {
  const c = client();
  const { data: { user } } = await c.auth.getUser();
  const { error } = await c
    .from('installation_crew')
    .update({ active: false, deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function restoreInstallationCrew(id: number): Promise<void> {
  const c = client();
  const { error } = await c
    .from('installation_crew')
    .update({ active: true, deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}
