import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

// GeoJSON Polygon/MultiPolygon drawn by the user on the map (Leaflet.draw). Kept
// loosely typed here — the map layer is the one that produces/consumes real GeoJSON.
export type ZoneBoundary = { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };

export type Zone = {
  id: number;
  company_id: number;
  name: string;
  color: string;
  boundary: ZoneBoundary | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ZoneInput = {
  name: string;
  color: string;
  boundary: ZoneBoundary | null;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

async function companyId(): Promise<number> {
  const c = client();
  const { data: { user }, error: ue } = await c.auth.getUser();
  if (ue || !user) throw new CoreRepositoryError('No hay un usuario autenticado.');
  const { data, error } = await c.from('user_account').select('company_id').eq('auth_user_id', user.id).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  if (data?.company_id == null) throw new CoreRepositoryError('El usuario no tiene empresa asignada.');
  return Number(data.company_id);
}

export async function listZones(includeInactive = false): Promise<Zone[]> {
  const c = client();
  const cid = await companyId();
  let q = c.from('zone').select('*').eq('company_id', cid).order('name', { ascending: true });
  if (!includeInactive) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data || []) as Zone[];
}

export async function createZone(input: ZoneInput): Promise<Zone> {
  const c = client();
  const cid = await companyId();
  const { data, error } = await c.from('zone').insert({
    company_id: cid,
    name: input.name.trim(),
    color: input.color,
    boundary: input.boundary,
  }).select('*').single();
  if (error) throw new CoreRepositoryError(error.message);
  return data as Zone;
}

export async function updateZone(id: number, input: Partial<ZoneInput> & { active?: boolean }): Promise<void> {
  const c = client();
  const cid = await companyId();
  const { error } = await c.from('zone').update({
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.boundary !== undefined ? { boundary: input.boundary } : {}),
    ...(input.active !== undefined ? { active: input.active } : {}),
    updated_at: new Date().toISOString(),
  }).eq('company_id', cid).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function deleteZone(id: number): Promise<void> {
  const c = client();
  const cid = await companyId();
  const { error } = await c.from('zone').delete().eq('company_id', cid).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}
