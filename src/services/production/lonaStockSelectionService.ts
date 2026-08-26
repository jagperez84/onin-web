import { CoreRepositoryError } from '../core/coreRepository';
import { listLonaStockCandidates, type LonaStockCandidate } from './lonaConfectionService';

/**
 * Resolves stock for lona confection.
 *
 * A product characteristic coming from the OTD is not necessarily a stock
 * characteristic. An uncharacterized physical stock item is therefore a
 * valid fallback when no exact-characteristic material is available.
 * Dimensional comparisons are performed using the units carried by the OTD
 * and by each physical stock item.
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
  const exact = input.characteristicCode
    ? await listLonaStockCandidates(input)
    : [];

  if (exact.length > 0) return exact;

  const uncharacterized = await listLonaStockCandidates({
    ...input,
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
