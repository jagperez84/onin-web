import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import type { Color } from './colorRepository';

export type CharacteristicColor = {
  id: number;
  characteristic_id: number;
  color_id: number;
  active: boolean;
  deleted_at: string | null;
  color?: Color | null;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

/** Colores asociados a una característica (activos por defecto). Todos comparten el escalado de precio de la característica. */
export async function listCharacteristicColors(characteristicId: number): Promise<CharacteristicColor[]> {
  const c = client();
  const { data, error } = await c
    .from('characteristic_color')
    .select('id,characteristic_id,color_id,active,deleted_at,color:color(id,company_id,code,name,active)')
    .eq('characteristic_id', characteristicId)
    .is('deleted_at', null)
    .order('id');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as unknown as CharacteristicColor[];
}

export async function addCharacteristicColor(characteristicId: number, colorId: number): Promise<void> {
  const c = client();
  const { error } = await c.from('characteristic_color').insert({ characteristic_id: characteristicId, color_id: colorId });
  if (error) throw new CoreRepositoryError(error.message);
}

export async function removeCharacteristicColor(id: number): Promise<void> {
  const c = client();
  const { error } = await c.from('characteristic_color').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null);
  if (error) throw new CoreRepositoryError(error.message);
}
