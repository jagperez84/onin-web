import type { ProductLineBehavior } from "../../services/sales/quotationCreationRepository";

type Props = { behavior: ProductLineBehavior | null };

const normalBehavior: ProductLineBehavior = {
  id: 0,
  company_id: 0,
  code: "NORMAL",
  name: "Normal",
  description: null,
  quantity_enabled: true,
  price_enabled: true,
  discount_enabled: true,
  dimensions_enabled: false,
  configuration_enabled: false,
  cut_calculation_enabled: false,
  length_enabled: false,
  characteristics_enabled: false,
  canvas_cut_enabled: false,
};

export function effectiveLineBehavior(
  behavior: ProductLineBehavior | null | undefined,
) {
  return behavior ?? normalBehavior;
}

export function QuotationLineBehavior({ behavior }: Props) {
  const current = effectiveLineBehavior(behavior);
  const advanced = [
    current.dimensions_enabled && "Dimensiones",
    current.configuration_enabled && "Configuración",
    current.cut_calculation_enabled && "Cálculo de corte",
    current.length_enabled && "Longitud",
    current.characteristics_enabled && "Características",
    current.canvas_cut_enabled && "Corte de lona",
  ].filter(Boolean) as string[];

  if (!advanced.length) return null;

  return (
    <div
      className="quotation-line-behavior"
      aria-label={`Comportamiento: ${current.name}`}
    >
      <span className="quotation-line-behavior-name">{current.name}</span>
      <span className="quotation-line-behavior-capabilities">
        {advanced.join(" · ")}
      </span>
    </div>
  );
}
