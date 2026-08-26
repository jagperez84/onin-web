import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type FamilyAttributeRef = {
  id: number;
  code: string;
  name: string;
  data_type: string;
};

export type FamilyAttributeAssignment = FamilyAttributeRef & {
  assignment_id: number;
  family_id: number;
  required: boolean;
  sort_order: number;
  active: boolean;
  deleted_at: string | null;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export async function listFamilyAttributeAssignments(familyId: number): Promise<FamilyAttributeAssignment[]> {
  const c = client();
  const { data, error } = await c
    .from('product_family_attribute')
    .select('id,family_id,attribute_id,required,sort_order,active,deleted_at,product_attribute!inner(id,code,name,data_type)')
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
    data_type: r.product_attribute.data_type,
    required: !!r.required,
    sort_order: r.sort_order ?? 0,
    active: !!r.active,
    deleted_at: r.deleted_at ?? null,
  }));
}

export async function listAvailableFamilyAttributes(companyId: number, familyId: number): Promise<FamilyAttributeRef[]> {
  const c = client();
  const [attrs, assigned] = await Promise.all([
    c.from('product_attribute').select('id,code,name,data_type').eq('company_id', companyId).eq('active', true).is('deleted_at', null).order('code'),
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

export async function updateFamilyAttributeAssignment(id: number, input: { required?: boolean; sort_order?: number; active?: boolean }): Promise<void> {
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

