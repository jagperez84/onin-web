import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { sanitizeSearchTerm } from '../core/searchSanitize';
import type { FallbackProfileEstimate } from './productRepository';

export type { FallbackProfileEstimate };
export type ProductLineBehaviorStatus = 'active' | 'inactive' | 'all';

export type ProductLineBehaviorRow = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  quantity_enabled: boolean;
  price_enabled: boolean;
  discount_enabled: boolean;
  dimensions_enabled: boolean;
  configuration_enabled: boolean;
  cut_calculation_enabled: boolean;
  length_enabled: boolean;
  characteristics_enabled: boolean;
  canvas_cut_enabled: boolean;
  roll_width_m: number | null;
  seam_allowance_width_m: number | null;
  seam_allowance_height_m: number | null;
  standard_bar_length_mm: number | null;
  fallback_profile_estimates: FallbackProfileEstimate[] | null;
};
export type ProductLineBehaviorForm = Omit<ProductLineBehaviorRow, 'id' | 'company_id'>;

const COLUMNS =
  'id,company_id,code,name,description,active,quantity_enabled,price_enabled,discount_enabled,' +
  'dimensions_enabled,configuration_enabled,cut_calculation_enabled,length_enabled,characteristics_enabled,' +
  'canvas_cut_enabled,roll_width_m,seam_allowance_width_m,seam_allowance_height_m,standard_bar_length_mm,fallback_profile_estimates';

function client() { if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.'); return supabase; }

export async function listProductLineBehaviors(companyId: number, search = '', status: ProductLineBehaviorStatus = 'active'): Promise<ProductLineBehaviorRow[]> {
  const c = client();
  let q = c.from('product_line_behavior').select(COLUMNS).eq('company_id', companyId).is('deleted_at', null).order('code');
  if (status === 'active') q = q.eq('active', true);
  if (status === 'inactive') q = q.eq('active', false);
  const term = sanitizeSearchTerm(search);
  if (term) q = q.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as unknown as ProductLineBehaviorRow[];
}

export async function getProductLineBehavior(companyId: number, id: number): Promise<ProductLineBehaviorRow> {
  const c = client();
  const { data, error } = await c.from('product_line_behavior').select(COLUMNS).eq('company_id', companyId).eq('id', id).single();
  if (error) throw new CoreRepositoryError(error.message);
  return data as unknown as ProductLineBehaviorRow;
}

export async function createProductLineBehavior(companyId: number, input: ProductLineBehaviorForm): Promise<number> {
  const c = client();
  const { data, error } = await c.from('product_line_behavior').insert({ company_id: companyId, ...input }).select('id').single();
  if (error) throw new CoreRepositoryError(error.message);
  return Number(data.id);
}

export async function updateProductLineBehavior(companyId: number, id: number, input: Partial<ProductLineBehaviorForm>): Promise<void> {
  const c = client();
  const { error } = await c.from('product_line_behavior').update(input).eq('company_id', companyId).eq('id', id);
  if (error) throw new CoreRepositoryError(error.message);
}
