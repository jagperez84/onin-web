import { ColorSwatch } from "../../components/ui/ColorSwatch";

type PreviewDimension = {
  name: string;
  value: number | null;
  unit?: { code?: string | null; symbol?: string | null } | null;
};

type PreviewCharacteristic = {
  color_id?: number | null;
  attribute?: { name?: string | null; code?: string | null } | null;
  color?: { code?: string | null; name?: string | null; hex?: string | null } | null;
};

/** Vista compacta de dimensiones y característica/color de una línea de artículo simple
 * (presupuesto o pedido), para pantallas de solo lectura que aún no tienen un snapshot
 * OTD que mostrar — el equivalente al resumen que ya se ve para líneas OTD. */
export function QuotationLineConfigPreview({
  dimensions,
  characteristics,
  className = "line-snapshot-preview-tag",
}: {
  dimensions?: PreviewDimension[] | null;
  characteristics?: PreviewCharacteristic[] | null;
  className?: string;
}) {
  const dims = (dimensions ?? []).filter((d) => d.value != null);
  const char = (characteristics ?? []).find((c) => c.color_id != null && c.color);
  if (dims.length === 0 && !char) return null;

  return (
    <div className={className} style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
      {dims.length > 0 && (
        <span>
          {dims
            .map((d) => `${d.name}: ${d.value ?? 0}${d.unit?.symbol || d.unit?.code ? ` ${d.unit?.symbol || d.unit?.code}` : ""}`)
            .join(" · ")}
        </span>
      )}
      {char?.color && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
          {dims.length > 0 ? "·" : ""}
          {char.attribute?.name ? `${char.attribute.name}: ` : ""}
          {char.color.name || char.color.code}
          <ColorSwatch hex={char.color.hex} code={char.color.code} name={char.color.name} size="xs" />
        </span>
      )}
    </div>
  );
}
