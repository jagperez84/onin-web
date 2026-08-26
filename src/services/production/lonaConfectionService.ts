import { loadMasterProductConfiguration } from '../catalog/productConfigurationService';
import type { MasterProductConfiguration } from '../catalog/productConfigurationService';
import { CoreRepositoryError } from '../core/coreRepository';

export type LonaConfectionComponent = {
  index: number;
  productId: number;
  productCode: string;
  productName: string;
  characteristicName: string | null;
  quantity: number;
  line: number | null;
  output: number | null;
  lineUnit: string | null;
  outputUnit: string | null;
  sourceComponent: OtdComponentSnapshot;
  productConfiguration: MasterProductConfiguration;
};

export type LonaCutGeometry = {
  width: number;
  height: number;
  widthLabel: string;
  heightLabel: string;
};

export type LonaConfectionResult = {
  orderLineId: number;
  orderLineNo: number;
  reference: string | null;
  otdCode: string | null;
  components: LonaConfectionComponent[];
};

type OtdDimensionSnapshot = {
  code?: string | null;
  name?: string | null;
  value?: unknown;
  unit_id?: number | null;
  unit_symbol?: string | null;
  unit_code?: string | null;
};

type OtdComponentSnapshot = {
  product_id?: unknown;
  product_code?: unknown;
  product_name?: unknown;
  characteristic_name?: unknown;
  quantity?: unknown;
  dimension_list?: OtdDimensionSnapshot[];
  dimensions?: Record<string, unknown>;
};

type OtdSnapshot = {
  otd_code?: unknown;
  components?: OtdComponentSnapshot[];
  dimensions?: OtdDimensionSnapshot[];
};

type DimensionValue = OtdDimensionSnapshot;

function numeric(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function componentDimensions(component: OtdComponentSnapshot, snapshot: OtdSnapshot): DimensionValue[] {
  const list = Array.isArray(component.dimension_list) ? component.dimension_list : [];
  if (list.length) return list;

  const entries = component.dimensions && typeof component.dimensions === 'object'
    ? Object.entries(component.dimensions).map(([code, value]) => ({ code, value } as OtdDimensionSnapshot))
    : [];
  if (entries.length) return entries;

  return Array.isArray(snapshot.dimensions) ? snapshot.dimensions : [];
}

function resolveDimensionUnit(dimension: DimensionValue | undefined, configuration: MasterProductConfiguration): string | null {
  if (!dimension) return null;

  // The OTD snapshot is authoritative when it already contains the dimension unit.
  if (dimension.unit_symbol) return dimension.unit_symbol;
  if (dimension.unit_code) return dimension.unit_code;
  if (dimension.unit_id != null) {
    const unit = configuration.unitsMap.get(Number(dimension.unit_id));
    if (unit) return unit.code || unit.name;
  }

  // If the snapshot only contains the dimension value, resolve the unit from the
  // measurement type of the component article. This deliberately does NOT use
  // the article base unit: dimensions have their own measurement units.
  const dimensionDefinition = configuration.dimensions.find((candidate) =>
    (dimension.code && candidate.code === dimension.code) ||
    (dimension.name && candidate.name === dimension.name)
  );
  if (dimensionDefinition?.unit_id != null) {
    const unit = configuration.unitsMap.get(Number(dimensionDefinition.unit_id));
    if (unit) return unit.code || unit.name;
  }

  return null;
}

function getGeometry(component: LonaConfectionComponent): LonaCutGeometry | null {
  const list = Array.isArray(component.sourceComponent.dimension_list)
    ? component.sourceComponent.dimension_list
    : Object.entries(component.sourceComponent.dimensions ?? {}).map(([code, value]) => ({ code, value } as OtdDimensionSnapshot));

  const first = list[0];
  const second = list[1];
  const width = numeric(first?.value);
  const height = numeric(second?.value);
  if (width == null || height == null || width <= 0 || height <= 0) return null;

  return {
    width,
    height,
    widthLabel: `${first?.code ?? 'Dimensión 1'}${component.lineUnit ? ` (${component.lineUnit})` : ''}`,
    heightLabel: `${second?.code ?? 'Dimensión 2'}${component.outputUnit ? ` (${component.outputUnit})` : ''}`,
  };
}

export function getLonaCutGeometry(component: LonaConfectionComponent): LonaCutGeometry | null {
  return getGeometry(component);
}

export async function resolveLonaConfectionComponents(input: {
  companyId: number;
  orderLineId: number;
  orderLineNo: number;
  reference?: string | null;
  snapshot: OtdSnapshot;
}): Promise<LonaConfectionResult> {
  const snapshot = input.snapshot ?? {};
  const rawComponents = Array.isArray(snapshot.components) ? snapshot.components : [];
  const candidates = rawComponents
    .map((component, index) => ({ component, index }))
    .filter(({ component }) => Number(component.product_id) > 0);

  const resolved: LonaConfectionComponent[] = [];
  for (const { component, index } of candidates) {
    const productId = Number(component.product_id);
    const configuration = await loadMasterProductConfiguration(productId, input.companyId);
    if (!configuration.family?.confectionable) continue;

    const dimensions = componentDimensions(component, snapshot);
    const first = dimensions[0];
    const second = dimensions[1];
    resolved.push({
      index,
      productId,
      productCode: String(component.product_code ?? configuration.product.code ?? ''),
      productName: String(component.product_name ?? configuration.product.commercial_description ?? configuration.product.technical_description ?? ''),
      characteristicName: component.characteristic_name ? String(component.characteristic_name) : null,
      quantity: numeric(component.quantity) ?? 0,
      line: numeric(first?.value),
      output: numeric(second?.value),
      lineUnit: resolveDimensionUnit(first, configuration),
      outputUnit: resolveDimensionUnit(second, configuration),
      sourceComponent: component,
      productConfiguration: configuration,
    });
  }

  if (resolved.length === 0) {
    throw new CoreRepositoryError('La línea de pedido no contiene componentes confeccionables.');
  }

  return {
    orderLineId: input.orderLineId,
    orderLineNo: input.orderLineNo,
    reference: input.reference ?? null,
    otdCode: snapshot.otd_code ? String(snapshot.otd_code) : null,
    components: resolved,
  };
}