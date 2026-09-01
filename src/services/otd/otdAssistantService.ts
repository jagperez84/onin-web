import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type OtdAssistantSelectionDraft = {
  code: string;
  name: string;
  selection_type: 'OPTION' | 'NUMBER' | 'TEXT' | 'BOOLEAN';
  required: boolean;
  is_dimension: boolean;
  unit_code?: string | null;
  options?: { code: string; label: string }[];
};

export type OtdAssistantVariableDraft = {
  code: string;
  name: string;
  expression: string;
  data_type: string;
};

export type OtdAssistantComponentDraft = {
  code: string;
  description: string;
  quantity_expression: string;
  component_type: 'BASIC' | 'IMPROVEMENT';
  unit_code?: string | null;
  dimension_expressions?: Record<string, string>;
};

export type OtdAssistantProposal = {
  selections: OtdAssistantSelectionDraft[];
  variables: OtdAssistantVariableDraft[];
  components: OtdAssistantComponentDraft[];
  notes?: string;
};

export async function proposeOtdDraft(input: {
  prompt: string;
  unitCodes: string[];
  existingSelections: { code: string }[];
  existingVariables: { code: string }[];
}): Promise<OtdAssistantProposal> {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  const { data, error } = await supabase.functions.invoke('otd-assistant', {
    body: {
      prompt: input.prompt,
      unitCodes: input.unitCodes,
      existingSelections: input.existingSelections,
      existingVariables: input.existingVariables,
    },
  });
  if (error) throw new CoreRepositoryError(error.message || 'No se pudo generar la propuesta.');
  if (data?.error) throw new CoreRepositoryError(data.error);
  return data as OtdAssistantProposal;
}
