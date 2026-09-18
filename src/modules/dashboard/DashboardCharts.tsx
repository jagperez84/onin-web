import { useState } from "react";

const money = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export type DonutSegment = { key: string; label: string; value: number; color: string };

/** Donut con hueco central: al pasar el ratón por un segmento o su leyenda, el centro
 * cambia del total a ese valor — evita un tooltip flotante para un widget tan pequeño. */
export function DonutChart({
  segments,
  size = 136,
  thickness = 18,
  totalLabel,
  valueFormat = (v: number) => String(v),
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  totalLabel: string;
  valueFormat?: (v: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  const gapDeg = visible.length > 1 ? 3 : 0;

  let acc = 0;
  const arcs = visible.map((s) => {
    const sweep = total > 0 ? (s.value / total) * 360 : 0;
    const start = acc + gapDeg / 2;
    // Un solo segmento al 100% da start=0/end=360, que en un arco SVG es un
    // punto degenerado (mismo inicio y fin) y no dibuja nada: se recorta a
    // 359.99° para que siga siendo un arco válido, visualmente un círculo completo.
    const end = Math.min(acc + Math.max(sweep - gapDeg / 2, gapDeg / 2), start + 359.99);
    acc += sweep;
    return { ...s, start, end: Math.max(start, end) };
  });

  const active = hovered != null ? arcs[hovered] : null;

  if (total === 0) {
    return <p className="form-help">No hay datos suficientes todavía.</p>;
  }

  return (
    <div className="donut-chart">
      <div className="donut-svg-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={totalLabel}>
          {arcs.map((a, i) => (
            <path
              key={a.key}
              d={arcPath(cx, cy, r, a.start, a.end)}
              stroke={a.color}
              strokeWidth={hovered === i ? thickness + 4 : thickness}
              strokeLinecap="round"
              fill="none"
              style={{ transition: "stroke-width .15s ease, opacity .15s ease", cursor: "default" }}
              opacity={hovered == null || hovered === i ? 1 : 0.45}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
        <div className="donut-center">
          {active ? (
            <>
              <strong>{valueFormat(active.value)}</strong>
              <span>{active.label}</span>
            </>
          ) : (
            <>
              <strong>{total}</strong>
              <span>{totalLabel}</span>
            </>
          )}
        </div>
      </div>
      <ul className="donut-legend">
        {arcs.map((a, i) => (
          <li
            key={a.key}
            className={hovered === i ? "active" : ""}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="donut-legend-dot" style={{ background: a.color }} />
            <span className="donut-legend-label">{a.label}</span>
            <span className="donut-legend-value">{valueFormat(a.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type BarPoint = { key: string; label: string; value: number };

/** Barras verticales con tooltip por barra (CSS puro, sin estado) y valor directo solo
 * sobre la barra más alta — el resto se lee al pasar el ratón. */
export function MiniBarChart({
  points,
  height = 140,
  color = "var(--primary)",
}: {
  points: BarPoint[];
  height?: number;
  color?: string;
}) {
  if (points.every((p) => p.value === 0)) {
    return <p className="form-help">No hay datos suficientes todavía.</p>;
  }
  const max = Math.max(1, ...points.map((p) => p.value));
  const maxIndex = points.reduce((best, p, i, arr) => (p.value > arr[best].value ? i : best), 0);

  return (
    <div className="mini-bar-chart" style={{ height }}>
      {points.map((p, i) => (
        <div key={p.key} className="mini-bar-col">
          <div className="mini-bar-tooltip">
            <strong>{money(p.value)}</strong>
            <span>{p.label}</span>
          </div>
          {i === maxIndex && p.value > 0 && <span className="mini-bar-value">{money(p.value)}</span>}
          <div
            className="mini-bar"
            style={{ height: `${p.value > 0 ? Math.max((p.value / max) * 100, 3) : 0}%`, background: color }}
          />
          <span className="mini-bar-label">{p.label}</span>
        </div>
      ))}
    </div>
  );
}
