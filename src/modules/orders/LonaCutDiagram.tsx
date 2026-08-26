import { Ruler } from 'lucide-react';
import type { LonaCutCalculationResult, LonaCutType } from '../../services/production/lonaCutCalculationService';
import './lona-cut-diagram.css';

type Props = { calculation: LonaCutCalculationResult | null; type: LonaCutType; stockDimensions: number[]; stockUnits: string[]; cutLine: number; cutOutput: number; unit: string | null };
type Segment = { kind: 'PANEL' | 'REMAINDER' | 'UNUSED'; length: number; label: string };
function dimension(value: number, unit: string | null) { return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit || ''}`.trim(); }

export function LonaCutDiagram({ calculation, type, stockDimensions, stockUnits, cutLine, cutOutput, unit }: Props) {
  if (!calculation || calculation.status !== 'CALCULATED' || stockDimensions.length < 2) return <div className="lona-diagram-empty">No hay una propuesta gráfica disponible para este corte.</div>;
  const stockLength = stockDimensions[0]; const stockWidth = stockDimensions[1];
  if (!(stockLength > 0) || !(stockWidth > 0)) return <div className="lona-diagram-empty">Las dimensiones del material no permiten representar el corte.</div>;
  const selectedWidth = calculation.selectedWidth; const remainder = calculation.leftRemainder; const segments: Segment[] = [];
  if (type === 'Degradee') segments.push({ kind: 'PANEL', length: Math.min(cutLine, stockLength), label: 'Pieza degradé' });
  else if (type === 'Retal Maxi' || type === 'Retal Mini') {
    const remainderCount = calculation.pieces.filter(piece => piece.kind === 'REMAINDER').length;
    if (remainderCount >= 1 && remainder > 0) segments.push({ kind: 'REMAINDER', length: remainder, label: 'Retal izquierdo' });
    for (let index = 0; index < calculation.fullPanels; index += 1) segments.push({ kind: 'PANEL', length: selectedWidth, label: `Paño ${index + 1}` });
    if (remainderCount >= 2 && remainder > 0) segments.push({ kind: 'REMAINDER', length: remainder, label: 'Retal derecho' });
  } else {
    for (let index = 0; index < calculation.fullPanels; index += 1) segments.push({ kind: 'PANEL', length: selectedWidth, label: `Paño ${index + 1}` });
    if (remainder > 0) segments.push({ kind: 'REMAINDER', length: remainder, label: 'Resto' });
  }
  const usedLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (usedLength < stockLength) segments.push({ kind: 'UNUSED', length: stockLength - usedLength, label: 'Margen disponible' });
  const total = Math.max(stockLength, usedLength);
  return <div className="lona-cut-diagram"><div className="lona-diagram-stage"><div className="lona-roll" aria-label={`Material ${dimension(stockLength, stockUnits[0] || unit)} × ${dimension(stockWidth, stockUnits[1] || unit)}`}>
    {segments.map((segment, index) => <div key={`${segment.kind}-${index}`} className={`lona-roll-piece ${segment.kind.toLowerCase()}`} style={{ width: `${(segment.length / total) * 100}%` }} title={`${segment.label}: ${dimension(segment.length, unit)}`}><div className="lona-roll-piece-content"><strong>{segment.label}</strong><small>{dimension(segment.length, unit)} × {dimension(Math.min(cutOutput, stockWidth), stockUnits[1] || unit)}</small></div></div>)}
    <span className="lona-roll-dimension">{dimension(stockLength, stockUnits[0] || unit)}</span><span className="lona-roll-width">{dimension(stockWidth, stockUnits[1] || unit)}</span>
  </div></div><div className="lona-diagram-legend"><span><i className="lona-legend-box panel"/>Paño</span><span><i className="lona-legend-box remainder"/>Resto</span><span><i className="lona-legend-box unused"/>Margen</span></div><div className="lona-diagram-caption"><Ruler size={12}/> Material {dimension(stockLength, stockUnits[0] || unit)} × {dimension(stockWidth, stockUnits[1] || unit)} · Corte {dimension(cutLine, unit)} × {dimension(cutOutput, unit)}</div></div>;
}
