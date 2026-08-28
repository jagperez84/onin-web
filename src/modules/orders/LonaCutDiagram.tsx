import { Ruler } from 'lucide-react';
import type { LonaCutCalculationResult, LonaCutPiece } from '../../services/production/lonaCutCalculationService';
import './lona-cut-diagram.css';

type Props = { calculation: LonaCutCalculationResult | null; stockDimensions: number[]; stockUnits: string[]; cutLine: number; cutOutput: number; unit: string | null };
type MarginChip = { kind: 'UNUSED'; length: number; width: number; label: string };

function dimension(value: number, unit: string | null) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit || ''}`.trim();
}

export function LonaCutDiagram({ calculation, stockDimensions, stockUnits, cutLine, cutOutput, unit }: Props) {
  if (!calculation || calculation.status !== 'CALCULATED' || stockDimensions.length < 2) {
    return <div className="lona-diagram-empty">No hay una propuesta gráfica disponible para este corte.</div>;
  }

  // warehouse_stock_item dimensions are [material width, roll length].
  const stockWidth = stockDimensions[0];
  const stockLength = stockDimensions[1];
  if (!(stockWidth > 0) || !(stockLength > 0)) {
    return <div className="lona-diagram-empty">Las dimensiones del material no permiten representar el corte.</div>;
  }

  const widthUnit = stockUnits[0] || unit;
  const lengthUnit = stockUnits[1] || unit;

  const panels = calculation.pieces.filter(piece => piece.kind === 'PANEL');
  const remainders = calculation.pieces.filter(piece => piece.kind === 'REMAINDER');
  const usedLength = calculation.pieces.reduce((sum, piece) => sum + piece.length, 0);
  const margin: MarginChip | null = usedLength < stockLength
    ? { kind: 'UNUSED', length: stockLength - usedLength, width: stockWidth, label: 'Margen disponible' }
    : null;

  // Los paños completos son la pieza que se repite y la que de verdad hay que ver de un
  // vistazo: se llevan el protagonismo de la barra. Si no hay ningún paño entero (p. ej.
  // Retal Maxi con solo dos retales), esos retales pasan a ser el protagonista, porque son
  // toda la pieza que se corta. El resto/margen que no ocupa el protagonismo se reduce a una
  // ficha informativa de tamaño fijo — sus medidas se leen, no se representan a escala.
  const protagonists: LonaCutPiece[] = panels.length > 0 ? panels : remainders;
  const chips: Array<LonaCutPiece | MarginChip> = panels.length > 0 ? [...remainders] : [];
  if (margin) chips.push(margin);

  // Cuando no hay ningún paño entero, el "resto"/"retal" pasa a ser toda la pieza que se
  // corta — no un sobrante — así que en la barra principal no se llama "Resto", igual que
  // Degradee ya se llama "Pieza degradé" y no "Paño".
  const protagonistLabel = (piece: LonaCutPiece, index: number) =>
    panels.length > 0 ? piece.label : protagonists.length > 1 ? `Pieza ${index + 1}` : 'Pieza';

  return (
    <div className="lona-cut-diagram">
      <div className="lona-diagram-stage">
        <div className="lona-roll" aria-label={`Material ${dimension(stockWidth, widthUnit)} × ${dimension(stockLength, lengthUnit)}`}>
          {protagonists.map((piece, index) => (
            <div key={`protagonist-${index}`} className="lona-roll-piece used" style={{ width: `${100 / protagonists.length}%` }} title={`${piece.label}: ${dimension(piece.width, widthUnit)} × ${dimension(piece.length, lengthUnit)}`}>
              <div className="lona-roll-piece-content">
                <strong>{protagonistLabel(piece, index)}</strong>
                <small>{dimension(piece.width, widthUnit)} × {dimension(piece.length, lengthUnit)}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="lona-diagram-chips">
          {chips.map((chip, index) => (
            <div key={`chip-${index}`} className={`lona-diagram-chip ${chip.kind === 'UNUSED' ? 'unused' : 'used'}`}>
              <span className="lona-diagram-chip-label">{chip.label}</span>
              <span className="lona-diagram-chip-value">{dimension(chip.width, widthUnit)} × {dimension(chip.length, lengthUnit)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="lona-diagram-legend">
        <span><i className="lona-legend-box used" />Se usa en confección</span>
        <span><i className="lona-legend-box unused" />Margen sin usar</span>
      </div>
      <div className="lona-diagram-caption">
        <Ruler size={12} /> Material {dimension(stockWidth, widthUnit)} × {dimension(stockLength, lengthUnit)} · Corte {dimension(cutLine, unit)} × {dimension(cutOutput, unit)}
      </div>
    </div>
  );
}
