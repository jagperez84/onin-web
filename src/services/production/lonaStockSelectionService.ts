import { CoreRepositoryError } from '../core/coreRepository';
import { loadMasterProductConfiguration } from '../catalog/productConfigurationService';
import { listLonaStockCandidates, type LonaStockCandidate } from './lonaConfectionService';

/**
 * Resolves stock for lona confection with exact characteristic matching rules:
 * - If a characteristic is specified, ONLY stock with that exact characteristic is returned.
 * - If NO characteristic is specified, ONLY stock with no characteristic is returned.
 */
export async function findLonaStockCandidates(input: {
  companyId: number;
  productId: number;
  characteristicId?: number | null;
  characteristicCode?: string | null;
  requiredLine: number;
  requiredOutput: number;
  requiredLineUnit?: string | null;
  requiredOutputUnit?: string | null;
}): Promise<LonaStockCandidate[]> {
  let requiredLineUnit = input.requiredLineUnit ?? null;
  let requiredOutputUnit = input.requiredOutputUnit ?? null;

  if (!requiredLineUnit || !requiredOutputUnit) {
    const configuration = await loadMasterProductConfiguration(input.productId, input.companyId);
    const dimensions = configuration.dimensions;
    if (!requiredLineUnit && dimensions[0]?.unit_id != null) {
      requiredLineUnit = configuration.unitsMap.get(Number(dimensions[0].unit_id))?.code ?? null;
    }
    if (!requiredOutputUnit && dimensions[1]?.unit_id != null) {
      requiredOutputUnit = configuration.unitsMap.get(Number(dimensions[1].unit_id))?.code ?? null;
    }
  }

  const resolvedInput = { ...input, requiredLineUnit, requiredOutputUnit };
  const candidates = await listLonaStockCandidates(resolvedInput);
  return candidates;
}
