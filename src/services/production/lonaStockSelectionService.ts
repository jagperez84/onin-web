import { CoreRepositoryError } from '../core/coreRepository';
import { loadMasterProductConfiguration } from '../catalog/productConfigurationService';
import { listLonaStockCandidates, type LonaStockCandidate } from './lonaConfectionService';

/**
 * Resolves stock for lona confection.
 *
 * A product characteristic coming from the OTD is not necessarily a stock
 * characteristic. An uncharacterized physical stock item is therefore a
 * valid fallback when no exact-characteristic material is available.
 * Dimensional comparisons are always made with explicit units.
 */
export async function findLonaStockCandidates(input: {
  companyId: number;
  productId: number;
  characteristicCode?: string | null;
  requiredLine: number;
  requiredOutput: number;
  requiredLineUnit?: string | null;
  requiredOutputUnit?: string | null;
}): Promise<LonaStockCandidate[]> {
  let requiredLineUnit=input.requiredLineUnit??null;
  let requiredOutputUnit=input.requiredOutputUnit??null;

  if (!requiredLineUnit || !requiredOutputUnit) {
    const configuration=await loadMasterProductConfiguration(input.productId,input.companyId);
    const dimensions=configuration.dimensions;
    if (!requiredLineUnit && dimensions[0]?.unit_id!=null) requiredLineUnit=configuration.unitsMap.get(Number(dimensions[0].unit_id))?.code??null;
    if (!requiredOutputUnit && dimensions[1]?.unit_id!=null) requiredOutputUnit=configuration.unitsMap.get(Number(dimensions[1].unit_id))?.code??null;
  }

  const resolvedInput={...input,requiredLineUnit,requiredOutputUnit};
  const exact = input.characteristicCode
    ? await listLonaStockCandidates(resolvedInput)
    : [];

  if (exact.length > 0) return exact;

  const uncharacterized = await listLonaStockCandidates({
    ...resolvedInput,
    characteristicCode: null,
  });

  if (uncharacterized.length > 0) {
    return uncharacterized.map(candidate => ({
      ...candidate,
      reason: input.characteristicCode
        ? `${candidate.reason} Se utiliza material sin característica porque no hay una pieza con la característica solicitada.`
        : candidate.reason,
    }));
  }

  if (!input.characteristicCode) return uncharacterized;

  throw new CoreRepositoryError('No hay material compatible para la confección.');
}
