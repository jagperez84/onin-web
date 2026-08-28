import { Ruler } from 'lucide-react';
import type { LonaCutCalculationResult } from '../../services/production/lonaCutCalculationService';
import './lona-cut-diagram.css';

type Props = { calculation: LonaCutCalculationResult | null; stockDimensions: number[]; stockUnits: string[]; cutLine: number; cutOutput: number; unit: string | null };

// PANEL y REMAINDER se cosen ambos en la pieza final (un paño completo y el retal que
// completa el ancho pedido son igual de "material usado"); solo UNUSED queda sin cortar
// en el rollo. Por eso el dibujo distingue "se usa" de "no se usa", no tres categorías.
type DiagramSegment = { kind: 'PANEL' | 'REMAINDER' | 'UNUSED'; length: number; width: number; label: string };

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

  const segments: DiagramSegment[] = calculation.pieces.map(piece => ({
    kind: piece.kind,
    length: piece.length,
    width: piece.width,
    label: piece.label,
  }));
  const usedLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (usedLength < stockLength) {
    segments.push({ kind: 'UNUSED', length: stockLength - usedLength, width: stockWidth, label: 'Margen disponible' });
  }
  const total = Math.max(stockLength, usedLength);

  return (
    <div className="lona-cut-diagram">
      <div className="lona-diagram-stage">
        <div className="lona-roll" aria-label={`Material ${dimension(stockWidth, widthUnit)} × ${dimension(stockLength, lengthUnit)}`}>
          {segments.map((segment, index) => (
            <div key={`${segment.kind}-${index}`} className={`lona-roll-piece ${segment.kind === 'UNUSED' ? 'unused' : 'used'}`} style={{ width: `${(segment.length / total) * 100}%` }} title={`${segment.label}: ${dimension(segment.width, widthUnit)} × ${dimension(segment.length, lengthUnit)}`}>
              <div className="lona-roll-piece-content">
                <strong>{segment.label}</strong>
                <small>{dimension(segment.width, widthUnit)} × {dimension(segment.length, lengthUnit)}</small>
              </div>
            </div>
          ))}
          <span className="lona-roll-dimension">{dimension(stockLength, lengthUnit)}</span>
          <span className="lona-roll-width">{dimension(stockWidth, widthUnit)}</span>
        </div>
      </div>
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
