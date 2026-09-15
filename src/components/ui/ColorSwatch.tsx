import { useState } from "react";
import "./color-swatch.css";

export type ColorSwatchProps = {
  hex?: string | null;
  code?: string | null;
  name?: string | null;
  size?: "xs" | "sm" | "md";
  className?: string;
};

/**
 * Tile de color pequeño, ampliable al hacer clic. Se usa junto al texto del
 * color (código/nombre) allí donde ya se muestra — no lo sustituye. Sin hex
 * se pinta un patrón neutro en vez de ocultarse, para no dar a entender que
 * el componente no tiene color asignado.
 */
export function ColorSwatch({ hex, code, name, size = "sm", className = "" }: ColorSwatchProps) {
  const [expanded, setExpanded] = useState(false);
  if (!hex && !code && !name) return null;
  const label = [code, name].filter(Boolean).join(" · ");

  return (
    <>
      <button
        type="button"
        className={`color-swatch-tile ${size} ${hex ? "" : "no-hex"} ${className}`}
        style={hex ? { background: hex } : undefined}
        title={label ? `Ver color: ${label}` : "Ver color"}
        aria-label={label ? `Ver color ${label}` : "Ver color"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setExpanded(true);
        }}
      />
      {expanded && (
        <div
          className="modal-backdrop color-swatch-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) setExpanded(false);
          }}
        >
          <div className="color-swatch-popover" role="dialog" aria-modal="true">
            <div className={`color-swatch-large ${hex ? "" : "no-hex"}`} style={hex ? { background: hex } : undefined} />
            <div className="color-swatch-popover-text">
              {code && <strong>{code}</strong>}
              {name && <span>{name}</span>}
              {hex ? <code>{hex}</code> : <span className="color-swatch-muted">Sin color definido en el Maestro</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
