import { calculateLonaCut, type LonaCutCalculationResult, type LonaCutType } from './lonaCutCalculationService';

export type LonaCutPresentation = {
  calculation: LonaCutCalculationResult;
  title: string;
  panelDescription: string;
  remainderDescription: string;
};

export function calculateLonaCutPresentation(input: {
  type: LonaCutType;
  line: number;
  selectedWidth: number;
  hem: number;
  overlap: number;
}): LonaCutPresentation {
  const calculation = calculateLonaCut(input);

  const title = calculation.status === 'PENDING'
    ? 'Cálculo pendiente'
    : `${calculation.fullPanels} paño${calculation.fullPanels === 1 ? '' : 's'} entero${calculation.fullPanels === 1 ? '' : 's'}`;

  const remainderDescription = calculation.status === 'PENDING'
    ? 'Este tipo de corte todavía no tiene una regla de cálculo definida en el legacy.'
    : calculation.hasRemainder
      ? `Resto lateral previsto: ${calculation.leftRemainder}`
      : 'Sin resto lateral previsto.';

  const panelDescription = calculation.status === 'PENDING'
    ? 'No se muestra una propuesta productiva hasta disponer de la regla de Screen.'
    : `Ancho de material seleccionado: ${calculation.selectedWidth}`;

  return { calculation, title, panelDescription, remainderDescription };
}

export const LONA_CUT_TYPES: Array<{ value: LonaCutType; label: string; description: string }> = [
  { value: 'Asimétrico', label: 'Asimétrico', description: 'Resto lateral.' },
  { value: 'Retal Maxi', label: 'Retal Maxi', description: 'Resto repartido a ambos lados.' },
  { value: 'Retal Mini', label: 'Retal Mini', description: 'Resto repartido con un paño menos.' },
  { value: 'Degradee', label: 'Degradee', description: 'Un único paño; no utiliza selección automática de restos.' },
  { value: 'Screen', label: 'Screen', description: 'Regla pendiente de definir en el legacy.' },
];
