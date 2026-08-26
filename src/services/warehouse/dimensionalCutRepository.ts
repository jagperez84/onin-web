import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type DimensionalCutSelection = {
  warehouseId: number;
  dimensionValues: number[];
  quantity: number;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export async function executeManualDimensionalCut(input: {
  companyId: number;
  productId: number;
  characteristicId: number | null;
  requiredLength: number;
  selections: DimensionalCutSelection[];
  reference?: string | null;
  notes?: string | null;
}): Promise<number> {
  if (input.requiredLength <= 0) throw new CoreRepositoryError('La longitud de corte debe ser mayor que cero.');
  if (!input.selections.length) throw new CoreRepositoryError('Debes seleccionar al menos una pieza.');

  const c = client();
  const { data, error } = await c.rpc('execute_manual_dimensional_cut', {
    p_company_id: input.companyId,
    p_product_id: input.productId,
    p_characteristic_id: input.characteristicId,
    p_required_dimension_values: [input.requiredLength],
    p_selections: input.selections.map(selection => ({
      warehouse_id: selection.warehouseId,
      dimension_values: selection.dimensionValues,
      quantity: selection.quantity,
    })),
    p_reference: input.reference ?? null,
    p_notes: input.notes ?? null,
  });

  if (error) throw new CoreRepositoryError(error.message);
  return Number(data);
}
