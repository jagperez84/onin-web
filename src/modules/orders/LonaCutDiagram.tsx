import { Ruler } from 'lucide-react';
import type { LonaCutCalculationResult, LonaCutType } from '../../services/production/lonaCutCalculationService';
import './lona-cut-diagram.css';

type Props = { calculation: LonaCutCalculationResult | null; type: LonaCutType; stockDimensions: number[]; stockUnits: string[]; cutLine: number; cutOutput: number; unit: string | null };

type GeometryRectangle = { kind: 'PANEL' | 'REMAINDER'; x: number; y: number; width: number; length: number; label: string };
type DiagramSegment = { kind: 'PANEL' | 'REMAINDER' | 'UNUSED'; length: number; label: string };

function dimension(value: number, unit: string | null) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit || ''}`.trim();
}

function asymmetricGeometry(stockWidth: number, stockLength: number, cutLine: number, cutOutput: number) {
  const direct = stockWidth >= cutLine && stockLength >= cutOutput;
  const rotated = !direct && stockWidth >= cutOutput && stockLength >= cutLine;
  if (!direct && !rotated) return null;

  const cutWidth = rotated ? cutOutput : cutLine;
  const cutLength = rotated ? cutLine : cutOutput;
  const rectangles: GeometryRectangle[] = [
    { kind: 'PANEL', x: 0, y: 0, width: cutLength, length: cutWidth, label: 'Paño 1' },
  ];
  if (stockLength > cutLength) {
    rectangles.push({ kind: 'REMAINDER', x: cutLength, y: 0, width: stockLength - cutLength, length: stockWidth, label: 'Resto longitudinal' });
  }
  if (stockWidth > cutWidth) {
    rectangles.push({ kind: 'REMAINDER', x: 0, y: cutWidth, width: cutLength, length: stockWidth - cutWidth, label: 'Resto lateral' });
  }
  return { cutWidth, cutLength, rotated, rectangles };
}

export function LonaCutDiagram({ calculation, type, stockDimensions, stockUnits, cutLine, cutOutput, unit }: Props) {
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

  if (type === 'Asimétrico') {
    const geometry = asymmetricGeometry(stockWidth, stockLength, cutLine, cutOutput);
    if (!geometry) {
      return <div className="lona-diagram-empty">El material seleccionado no permite realizar el corte en ninguna orientación.</div>;
    }

    return (
      <div className="lona-cut-diagram">
        <div className="lona-diagram-stage lona-geometry-stage">
          <div className="lona-geometry-roll" role="img" aria-label={`Material ${dimension(stockWidth, widthUnit)} × ${dimension(stockLength, lengthUnit)}`}>
            {geometry.rectangles.map((rectangle, index) => (
              <div
                key={`${rectangle.kind}-${index}`}
                className={`lona-geometry-piece ${rectangle.kind.toLowerCase()}`}
                style={{
                  left: `${(rectangle.x / stockLength) * 100}%`,
                  top: `${(rectangle.y / stockWidth) * 100}%`,
                  width: `${(rectangle.width / stockLength) * 100}%`,
                  height: `${(rectangle.length / stockWidth) * 100}%`,
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

  const segments: DiagramSegment[] = calculation.pieces.map(piece => ({
    kind: piece.kind,
    length: piece.length,
    label: piece.label,
  }));
  const usedLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (usedLength < stockLength) {
    segments.push({ kind: 'UNUSED', length: stockLength - usedLength, label: 'Margen disponible' });
  }
  const total = Math.max(stockLength, usedLength);

  return (
    <div className="lona-cut-diagram">
      <div className="lona-diagram-stage">
        <div className="lona-roll" aria-label={`Material ${dimension(stockWidth, widthUnit)} × ${dimension(stockLength, lengthUnit)}`}>
          {segments.map((segment, index) => (
            <div key={`${segment.kind}-${index}`} className={`lona-roll-piece ${segment.kind.toLowerCase()}`} style={{ width: `${(segment.length / total) * 100}%` }} title={`${segment.label}: ${dimension(segment.length, lengthUnit)}`}>
              <div className="lona-roll-piece-content">
                <strong>{segment.label}</strong>
                <small>{dimension(segment.length, lengthUnit)} × {dimension(Math.min(cutOutput, stockWidth), widthUnit)}</small>
              </div>
            </div>
          ))}
          <span className="lona-roll-dimension">{dimension(stockLength, lengthUnit)}</span>
          <span className="lona-roll-width">{dimension(stockWidth, widthUnit)}</span>
        </div>
      </div>
      <div className="lona-diagram-legend">
        <span><i className="lona-legend-box panel" />Paño</span>
        <span><i className="lona-legend-box remainder" />Resto</span>
        <span><i className="lona-legend-box unused" />Margen</span>
      </div>
      <div className="lona-diagram-caption">
        <Ruler size={12} /> Material {dimension(stockWidth, widthUnit)} × {dimension(stockLength, lengthUnit)} · Corte {dimension(cutLine, unit)} × {dimension(cutOutput, unit)}
      </div>
    </div>
  );
}
