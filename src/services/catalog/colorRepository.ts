import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { markForDeletion, restoreFromDeletion } from '../core/softDeleteRepository';
import { sanitizeSearchTerm } from '../core/searchSanitize';

export type ColorStandard = 'RAL_CLASSIC' | 'RAL_DESIGN' | 'RAL_EFFECT' | 'PANTONE' | 'NCS' | 'FABRICANTE' | 'PERSONALIZADO' | 'TEXTIL_CATALOGO';

export const CUSTOM_COLOR_STANDARDS: { value: ColorStandard; label: string }[] = [
  { value: 'FABRICANTE', label: 'Fabricante (sin código de sistema)' },
  { value: 'PERSONALIZADO', label: 'Personalizado' },
  { value: 'PANTONE', label: 'Pantone' },
  { value: 'NCS', label: 'NCS' },
  { value: 'TEXTIL_CATALOGO', label: 'Catálogo textil (Sauleda, Dickson…)' },
];

export type ColorReferenceItem = {
  id: number;
  standard: string;
  code: string;
  name: string;
  hex: string;
};

export type ColorFinish = {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
};

export type ColorMaster = {
  id: number;
  companyId: number;
  code: string;
  name: string;
  active: boolean;
  deletedAt: string | null;
  hex: string | null;
  baseReferenceId: number | null;
  finishId: number | null;
  standard: string | null;
  supplierCode: string | null;
  baseReference: { standard: string; code: string; name: string } | null;
  finish: { code: string; name: string } | null;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  return supabase;
}

const COLOR_SELECT = 'id,company_id,code,name,active,deleted_at,hex,base_reference_id,finish_id,standard,supplier_code,base_reference:color_reference_library(standard,code,name),finish:color_finish(code,name)';

function mapColorRow(r: any): ColorMaster {
  return {
    id: Number(r.id),
    companyId: Number(r.company_id),
    code: r.code,
    name: r.name,
    active: !!r.active,
    deletedAt: r.deleted_at ?? null,
    hex: r.hex ?? null,
    baseReferenceId: r.base_reference_id == null ? null : Number(r.base_reference_id),
    finishId: r.finish_id == null ? null : Number(r.finish_id),
    standard: r.standard ?? null,
    supplierCode: r.supplier_code ?? null,
    baseReference: r.base_reference ? { standard: r.base_reference.standard, code: r.base_reference.code, name: r.base_reference.name } : null,
    finish: r.finish ? { code: r.finish.code, name: r.finish.name } : null,
  };
}

/** Busca en la biblioteca de referencia global (hoy solo RAL Classic) por código o nombre. */
export async function searchColorReferenceLibrary(query: string, standard: ColorStandard = 'RAL_CLASSIC', limit = 30): Promise<ColorReferenceItem[]> {
  const c = client();
  let q = c.from('color_reference_library').select('id,standard,code,name,hex').eq('standard', standard).order('code').limit(limit);
  const term = sanitizeSearchTerm(query);
  if (term) q = q.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as ColorReferenceItem[];
}

/** Catálogo global de acabados (Liso, Mate, Texturado…), ordenado para mostrar en un selector. */
export async function listColorFinishes(): Promise<ColorFinish[]> {
  const c = client();
  const { data, error } = await c.from('color_finish').select('id,code,name,sort_order').order('sort_order');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map((r: any) => ({ id: Number(r.id), code: r.code, name: r.name, sortOrder: Number(r.sort_order) }));
}

export async function listColorMaster(companyId: number, search = '', state: 'active' | 'inactive' | 'deleted' | 'all' = 'active'): Promise<ColorMaster[]> {
  const c = client();
  let q = c.from('color').select(COLOR_SELECT).eq('company_id', companyId).order('code');
  if (state === 'active') q = q.eq('active', true).is('deleted_at', null);
  if (state === 'inactive') q = q.eq('active', false).is('deleted_at', null);
  if (state === 'deleted') q = q.not('deleted_at', 'is', null);
  const term = sanitizeSearchTerm(search);
  if (term) q = q.or(`code.ilike.%${term}%,name.ilike.%${term}%,supplier_code.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map(mapColorRow);
}

/** Alta desde la biblioteca de referencia: precarga código/nombre/hex, editables antes de guardar. */
export async function createColorFromReference(input: {
  companyId: number;
  referenceId: number;
  standard: ColorStandard;
  finishId: number | null;
  code: string;
  name: string;
  hex: string;
}): Promise<ColorMaster> {
  const c = client();
  const { data, error } = await c
    .from('color')
    .insert({
      company_id: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      active: true,
      hex: input.hex,
      base_reference_id: input.referenceId,
      finish_id: input.finishId,
      standard: input.standard,
    })
    .select(COLOR_SELECT)
    .single();
  if (error) throw new CoreRepositoryError(error.message);
  return mapColorRow(data);
}

/** Alta manual: color de fabricante, personalizado, Pantone/NCS dictado o catálogo textil. */
export async function createCustomColor(input: {
  companyId: number;
  code: string;
  name: string;
  hex: string | null;
  standard: ColorStandard;
  supplierCode: string | null;
  finishId?: number | null;
}): Promise<ColorMaster> {
  const c = client();
  const { data, error } = await c
    .from('color')
    .insert({
      company_id: input.companyId,
      code: input.code.trim(),
      name: input.name.trim(),
      active: true,
      hex: input.hex,
      base_reference_id: null,
      finish_id: input.finishId ?? null,
      standard: input.standard,
      supplier_code: input.supplierCode?.trim() || null,
    })
    .select(COLOR_SELECT)
    .single();
  if (error) throw new CoreRepositoryError(error.message);
  return mapColorRow(data);
}

export async function updateColorMaster(id: number, patch: {
  code?: string;
  name?: string;
  hex?: string | null;
  active?: boolean;
  finishId?: number | null;
  supplierCode?: string | null;
}): Promise<ColorMaster> {
  const c = client();
  const update: Record<string, unknown> = {};
  if (patch.code !== undefined) update.code = patch.code.trim();
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.hex !== undefined) update.hex = patch.hex;
  if (patch.active !== undefined) update.active = patch.active;
  if (patch.finishId !== undefined) update.finish_id = patch.finishId;
  if (patch.supplierCode !== undefined) update.supplier_code = patch.supplierCode?.trim() || null;
  const { data, error } = await c.from('color').update(update).eq('id', id).select(COLOR_SELECT).single();
  if (error) throw new CoreRepositoryError(error.message);
  return mapColorRow(data);
}

export async function markColorForDeletion(id: number): Promise<void> {
  await markForDeletion('color', id);
}

export async function restoreColorFromDeletion(id: number): Promise<void> {
  await restoreFromDeletion('color', id);
}
