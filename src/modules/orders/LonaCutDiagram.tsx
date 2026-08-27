import { Ruler } from 'lucide-react';
import type { LonaCutCalculationResult, LonaCutType } from '../../services/production/lonaCutCalculationService';
import './lona-cut-diagram.css';

type Props = { calculation: LonaCutCalculationResult | null; type: LonaCutType; stockDimensions: number[]; stockUnits: string[]; cutLine: number; cutOutput: number; unit: string | null };

function dimension(value: number, unit: string | null) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit || ''}`.trim();
}

export function LonaCutDiagram({ calculation, type, stockDimensions, stockUnits, cutLine, cutOutput, unit }: Props) {
  if (!calculation || calculation.status !== 'CALCULATED' || stockDimensions.length < 2) {
    return <div className="lona-diagram-empty">No hay una propuesta gráfica disponible para este corte.</div>;
  }

  // Stock dimensions are stored as [material width, roll length]. The diagram
  // deliberately renders the roll with length on X and width on Y.
  const stockWidth = stockDimensions[0];
  const stockLength = stockDimensions[1];
  if (!(stockWidth > 0) || !(stockLength > 0)) {
    return <div className="lona-diagram-empty">Las dimensiones del material no permiten representar el corte.</div>;
  }

  const geometry = calculation.geometry;
  if (geometry && type === 'Asimétrico') {
    const widthUnit = stockUnits[0] || unit;
    const lengthUnit = stockUnits[1] || unit;
    const rectangles = geometry.rectangles;
    const title = `Material ${dimension(stockWidth, widthUnit)} × ${dimension(stockLength, lengthUnit)}`;

    return (
      <div className="lona-cut-diagram">
        <div className="lona-diagram-stage lona-geometry-stage">
          <div className="lona-geometry-roll" role="img" aria-label={title}>
            {rectangles.map((rectangle, index) => (
              <div
                key={`${rectangle.kind}-${index}`}
                className={`lona-geometry-piece ${rectangle.kind.toLowerCase()}`}
                style={{
                  left: `${(rectangle.x / geometry.stockLength) * 100}%`,
                  top: `${(rectangle.y / geometry.stockWidth) * 100}%`,
                  width: `${(rectangle.width / geometry.stockLength) * 100}%`,
                  height: `${(rectangle.length / geometry.stockWidth) * 100}%`,
                }}
                title={`${rectangle.label}: ${dimension(rectangle.width, lengthUnit)} × ${dimension(rectangle.length, widthUnit)}`}
              >
                <div className="lona-geometry-piece-content">
                  <strong>{rectangle.label}</strong>
                  <small>{dimension(rectangle.width, lengthUnit)} × {dimension(rectangle.length, widthUnit)}</small>
                </div>
              </div>
            ))}
            <span className="lona-geometry-dimension lona-geometry-length">{dimension(stockLength, lengthUnit)}</span>
            <span className="lona-geometry-dimension lona-geometry-width">{dimension(stockWidth, widthUnit)}</span>
          </div>
        </div>

        <div className="lona-diagram-legend">
          <span><i className="lona-legend-box panel" />Paño</span>
          <span><i className="lona-legend-box remainder" />Resto</span>
        </div>
        <div className="lona-diagram-caption">
          <Ruler size={12} /> Material {dimension(stockWidth, widthUnit)} × {dimension(stockLength, lengthUnit)} · Corte {dimension(cutLine, unit)} × {dimension(cutOutput, unit)} · {geometry.rotated ? 'Paño girado' : 'Orientación original'}
        </div>
      </div>
    );
  }

  // Legacy-compatible fallback for the cut types whose detailed 2D rules are
  // not yet represented by the geometry model.
  const selectedWidth = calculation.selectedWidth;
  const remainder = calculation.leftRemainder;
  const segments = calculation.pieces.map(piece => ({
    kind: piece.kind,
    length: piece.length,
    label: piece.label,
  }));
  if (remainder > 0 && !segments.some(segment => segment.kind === 'REMAINDER')) {
    segments.push({ kind: 'REMAINDER', length: remainder, label: 'Resto' });
  }
  const usedLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (usedLength < stockLength) segments.push({ kind: 'UNUSED', length: stockLength - usedLength, label: 'Margen disponible' });
  const total = Math.max(stockLength, usedLength);

  return (
    <div className="lona-cut-diagram">
      <div className="lona-diagram-stage">
        <div className="lona-roll" aria-label={`Material ${dimension(stockWidth, stockUnits[0] || unit)} × ${dimension(stockLength, stockUnits[1] || unit)}`}>
          {segments.map((segment, index) => (
            <div
              key={`${segment.kind}-${index}`}
              className={`lona-roll-piece ${segment.kind.toLowerCase()}`}
              style={{ width: `${(segment.length / total) * 100}%` }}
              title={`${segment.label}: ${dimension(segment.length, stockUnits[1] || unit)}`}
            >
              <div className="lona-roll-piece-content">
                <strong>{segment.label}</strong>
                <small>{dimension(segment.length, stockUnits[1] || unit)} × {dimension(Math.min(cutOutput, stockWidth), stockUnits[0] || unit)}</small>
              </div>
            </div>
          ))}
          <span className="lona-roll-dimension">{dimension(stockLength, stockUnits[1] || unit)}</span>
          <span className="lona-roll-width">{dimension(stockWidth, stockUnits[0] || unit)}</span>
        </div>
      </div>
      <div className="lona-diagram-legend">
        <span><i className="lona-legend-box panel" />Paño</span>
        <span><i className="lona-legend-box remainder" />Resto</span>
        <span><i className="lona-legend-box unused" />Margen</span>
      </div>
      <div className="lona-diagram-caption">
        <Ruler size={12} /> Material {dimension(stockWidth, stockUnits[0] || unit)} × {dimension(stockLength, stockUnits[1] || unit)} · Corte {dimension(cutLine, unit)} × {dimension(cutOutput, unit)}
      </div>
    </div>
  );
}
