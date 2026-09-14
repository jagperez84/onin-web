import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type FamilyAttributeRef = {
  id: number;
  code: string;
  name: string;
};

export type FamilyAttributeAssignment = FamilyAttributeRef & {
  assignment_id: number;
  family_id: number;
  required: boolean;
  sort_order: number;
  active: boolean;
  deleted_at: string | null;
  scaled: boolean;
  pvp: number | null;
};

export type FamilyAttributeScale = {
  id: number;
  family_attribute_id: number;
  dimension_1: number;
  dimension_2: number | null;
  price: number;
  deleted_at: string | null;
};

export type FamilyAttributeColorExclusion = {
  id: number;
  family_attribute_id: number;
  color_id: number;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export async function listFamilyAttributeAssignments(familyId: number): Promise<FamilyAttributeAssignment[]> {
  const c = client();
  const { data, error } = await c
    .from('product_family_attribute')
    .select('id,family_id,attribute_id,required,sort_order,active,deleted_at,scaled,pvp,product_attribute!inner(id,code,name)')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .order('sort_order')
    .order('attribute_id');

  if (error) {
    if (error.message?.includes('product_family_attribute') || error.code === '42P01') {
      return [];
    }
    throw new CoreRepositoryError(error.message);
  }

  return (data ?? []).map((r: any) => ({
    assignment_id: r.id,
    family_id: r.family_id,
    id: r.product_attribute.id,
    code: r.product_attribute.code,
    name: r.product_attribute.name,
    required: !!r.required,
    sort_order: r.sort_order ?? 0,
    active: !!r.active,
    deleted_at: r.deleted_at ?? null,
    scaled: !!r.scaled,
    pvp: r.pvp == null ? null : Number(r.pvp),
  }));
}

export async function listAvailableFamilyAttributes(companyId: number, familyId: number): Promise<FamilyAttributeRef[]> {
  const c = client();
  const [attrs, assigned] = await Promise.all([
    c.from('product_attribute').select('id,code,name').eq('company_id', companyId).eq('active', true).is('deleted_at', null).order('code'),
    c.from('product_family_attribute').select('attribute_id').eq('family_id', familyId).is('deleted_at', null),
  ]);

  if (attrs.error) throw new CoreRepositoryError(attrs.error.message);
  if (assigned.error) {
    if (assigned.error.message?.includes('product_family_attribute') || assigned.error.code === '42P01') {
      return (attrs.data ?? []) as FamilyAttributeRef[];
    }
    throw new CoreRepositoryError(assigned.error.message);
  }

  const ids = new Set((assigned.data ?? []).map((x: any) => Number(x.attribute_id)));
  return ((attrs.data ?? []) as FamilyAttributeRef[]).filter(x => !ids.has(x.id));
}

export async function assignFamilyAttribute(familyId: number, attributeId: number, required = false, sortOrder = 0): Promise<void> {
  const c = client();
  const { error } = await c.from('product_family_attribute').upsert(
    {
      family_id: familyId,
      attribute_id: attributeId,
      required,
      sort_order: sortOrder,
      active: true,
      deleted_at: null,
      deleted_by: null,
    },
    { onConflict: 'family_id,attribute_id' }
  );

  if (error) throw new CoreRepositoryError(error.message);
}

export async function updateFamilyAttributeAssignment(id: number, input: { required?: boolean; sort_order?: number; active?: boolean; scaled?: boolean; pvp?: number | null }): Promise<void> {
  const c = client();
  const { error } = await c.from('product_family_attribute').update(input).eq('id', id).is('deleted_at', null);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function removeFamilyAttributeAssignment(id: number): Promise<void> {
  const c = client();
  const { data: user } = await c.auth.getUser();
  const { error } = await c
    .from('product_family_attribute')
    .update({ active: false, deleted_at: new Date().toISOString(), deleted_by: user.user?.id ?? null })
    .eq('id', id)
    .is('deleted_at', null);

  if (error) throw new CoreRepositoryError(error.message);
}

export async function listFamilyAttributeScales(familyAttributeId: number): Promise<FamilyAttributeScale[]> {
  const c = client();
  const { data, error } = await c
    .from('product_family_attribute_scale')
    .select('id,family_attribute_id,dimension_1,dimension_2,price,deleted_at')
    .eq('family_attribute_id', familyAttributeId)
    .is('deleted_at', null)
    .order('dimension_1')
    .order('dimension_2');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map((r: any) => ({
    id: Number(r.id),
    family_attribute_id: Number(r.family_attribute_id),
    dimension_1: Number(r.dimension_1),
    dimension_2: r.dimension_2 == null ? null : Number(r.dimension_2),
    price: Number(r.price),
    deleted_at: r.deleted_at ?? null,
  }));
}

export async function createFamilyAttributeScale(familyAttributeId: number, input: { dimension_1: number; dimension_2: number | null; price: number }): Promise<void> {
  if (input.price <= 0) throw new CoreRepositoryError('El precio del escalado debe ser mayor que 0.');
  const c = client();
  const { error } = await c.from('product_family_attribute_scale').insert({ family_attribute_id: familyAttributeId, ...input });
  if (error) throw new CoreRepositoryError(error.message);
}

export async function updateFamilyAttributeScale(id: number, input: { dimension_1: number; dimension_2: number | null; price: number }): Promise<void> {
  if (input.price <= 0) throw new CoreRepositoryError('El precio del escalado debe ser mayor que 0.');
  const c = client();
  const { error } = await c.from('product_family_attribute_scale').update(input).eq('id', id).is('deleted_at', null);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function markFamilyAttributeScaleForDeletion(id: number): Promise<void> {
  const c = client();
  const { error } = await c.from('product_family_attribute_scale').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null);
  if (error) throw new CoreRepositoryError(error.message);
}

/** Exclusiones de colores heredados de attribute_color para esta característica de familia. Ausencia = color disponible. */
export async function listFamilyAttributeColorExclusions(familyAttributeId: number): Promise<FamilyAttributeColorExclusion[]> {
  const c = client();
  const { data, error } = await c
    .from('product_family_attribute_color_exclusion')
    .select('id,family_attribute_id,color_id')
    .eq('family_attribute_id', familyAttributeId);
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map((r: any) => ({ id: Number(r.id), family_attribute_id: Number(r.family_attribute_id), color_id: Number(r.color_id) }));
}

export async function excludeFamilyAttributeColor(familyAttributeId: number, colorId: number): Promise<void> {
  const c = client();
  const { error } = await c.from('product_family_attribute_color_exclusion').insert({ family_attribute_id: familyAttributeId, color_id: colorId });
  if (error) throw new CoreRepositoryError(error.message);
}

export async function includeFamilyAttributeColor(exclusionId: number): Promise<void> {
  const c = client();
  const { error } = await c.from('product_family_attribute_color_exclusion').delete().eq('id', exclusionId);
  if (error) throw new CoreRepositoryError(error.message);
}

export async function getFamilyAttributesCounts(): Promise<Record<number, number>> {
  const c = client();
  const { data, error } = await c
    .from('product_family_attribute')
    .select('family_id')
    .eq('active', true)
    .is('deleted_at', null);

  if (error) return {};
  const counts: Record<number, number> = {};
  for (const row of data ?? []) {
    const fid = Number(row.family_id);
    counts[fid] = (counts[fid] ?? 0) + 1;
  }
  return counts;
}

