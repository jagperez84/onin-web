import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import type { ColorRef } from './characteristicColorRepository';

export type AttributeColor = {
  id: number;
  attribute_id: number;
  color_id: number;
  active: boolean;
  deleted_at: string | null;
  color?: ColorRef | null;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

/** Colores asociados a una característica de sistema (product_attribute). Familia y artículo heredarán este conjunto con exclusiones propias. */
export async function listAttributeColors(attributeId: number): Promise<AttributeColor[]> {
  const c = client();
  const { data, error } = await c
    .from('attribute_color')
    .select('id,attribute_id,color_id,active,deleted_at,color:color(id,code,name,active)')
    .eq('attribute_id', attributeId)
    .is('deleted_at', null)
    .order('id');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as unknown as AttributeColor[];
}

export async function addAttributeColor(attributeId: number, colorId: number): Promise<void> {
  const c = client();
  const { error } = await c.from('attribute_color').insert({ attribute_id: attributeId, color_id: colorId });
  if (error) throw new CoreRepositoryError(error.message);
}

export async function removeAttributeColor(id: number): Promise<void> {
  const c = client();
  const { error } = await c.from('attribute_color').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function getAttributeColorCounts(): Promise<Record<number, number>> {
  const c = client();
  const { data, error } = await c.from('attribute_color').select('attribute_id').eq('active', true).is('deleted_at', null);
  if (error) return {};
  const counts: Record<number, number> = {};
  for (const row of data ?? []) {
    const id = Number((row as any).attribute_id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
