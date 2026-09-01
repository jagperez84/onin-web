import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type OtdAssistantSelectionDraft = { code: string; name: string; selection_type: 'OPTION' | 'NUMBER' | 'TEXT' | 'BOOLEAN'; required: boolean; is_dimension: boolean; unit_code?: string | null; options?: { code: string; label: string }[] };
export type OtdAssistantVariableDraft = { code: string; name: string; expression: string; data_type: string };
export type OtdAssistantComponentDraft = { code: string; description: string; quantity_expression: string; component_type: 'BASIC' | 'IMPROVEMENT'; unit_code?: string | null; dimension_expressions?: Record<string, string> };
export type OtdAssistantProposal = { selections: OtdAssistantSelectionDraft[]; variables: OtdAssistantVariableDraft[]; components: OtdAssistantComponentDraft[]; notes?: string };

const OTD_SCOPE_TERMS = ['otd','orden tecnica','orden técnica','despiece','articulo','artículo','producto','componente','componentes','material','materiales','pieza','piezas','medida','medidas','dimension','dimensión','dimensiones','ancho','alto','salida','color','lona','toldo','perfil','motor','brazo','accionamiento','confeccion','confección','formula','fórmula','variable','variables','entrada','entradas'];
const isLikelyOtdRequest = (prompt: string) => { const normalized = prompt.toLocaleLowerCase('es-ES'); return OTD_SCOPE_TERMS.some((term) => normalized.includes(term)); };

async function getFunctionError(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : 'No se pudo generar la propuesta.';
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string') return body.error;
      if (typeof body?.message === 'string') return body.message;
    } catch { /* keep fallback */ }
  }
  return fallback;
}

export async function proposeOtdDraft(input: { prompt: string; unitCodes: string[]; existingSelections: { code: string }[]; existingVariables: { code: string }[] }): Promise<OtdAssistantProposal> {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  if (!input.prompt.trim()) throw new CoreRepositoryError('Describe qué necesitas para el OTD.');
  if (!isLikelyOtdRequest(input.prompt)) throw new CoreRepositoryError('Este asistente está especializado en OTD. Describe una necesidad relacionada con entradas, variables, fórmulas o componentes del OTD.');

  const { data, error } = await supabase.functions.invoke('otd-assistant', { body: { prompt: input.prompt, unitCodes: input.unitCodes, existingSelections: input.existingSelections, existingVariables: input.existingVariables } });
  if (error) throw new CoreRepositoryError(await getFunctionError(error));
  if (data?.error) throw new CoreRepositoryError(data.error);
  return data as OtdAssistantProposal;
}
