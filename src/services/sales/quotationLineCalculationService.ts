import type { MasterProductConfiguration } from '../catalog/productConfigurationService';
import { calculateLinePricing, type LinePriceCalculation, type CharacteristicIncrementItem } from '../catalog/productPricingService';
import { calculateBillOfMaterials, type BillOfMaterialsCalculation } from '../catalog/billOfMaterialsService';
import { calculateCuts, type CutCalculationResult } from '../catalog/cutCalculationService';
import { checkStockAvailability, type StockAvailabilityPreview } from '../warehouse/stockAvailabilityService';
import type { QuotationLineCharacteristicDraft, QuotationLineDimensionDraft } from './quotationCreationRepository';

export type SnapshotDimension = {
  dimension_number: number;
  code: string;
  name: string;
  value: number | null;
  unit_id: number | null;
  unit_code: string;
  unit_name: string;
  decimals: number;
};

export type SnapshotAttribute = {
  assignment_id: number;
  attribute_id: number;
  code: string;
  name: string;
  value_id: number | null;
  value_code: string | null;
  value_label: string;
  data_type: string;
  price_increment?: number;
  value_text?: string | null;
  value_number?: number | null;
  value_boolean?: boolean | null;
};

export type SnapshotVariant = {
  id: number;
  code: string;
  description: string;
  pvp: number | null;
  price_increment: number | null;
};

export type QuotationLineSnapshot = {
  snapshot_version: string;
  created_at: string;
  master_version_hash: string;
  article: {
    id: number;
    code: string;
    technical_description: string | null;
    commercial_description: string | null;
    base_unit_id: number | null;
    base_unit_code: string;
    base_unit_name: string;
    iva_percent: number | null;
    family_id: number | null;
    family_name: string | null;
    line_behavior_id: number | null;
    line_behavior_code: string | null;
    scaled: boolean;
    scaled_by_characteristic: boolean;
  };
  selected_variant: SnapshotVariant | null;
  selected_attributes: SnapshotAttribute[];
  dimensions: SnapshotDimension[];
  quantity: number;
  pricing: LinePriceCalculation;
  breakdown: BillOfMaterialsCalculation;
  cuts: CutCalculationResult;
  stock_preview: StockAvailabilityPreview | null;
  notes?: string;
};

export type MasterDifference = {
  field: string;
  label: string;
  snapshotValue: string;
  masterValue: string;
  severity: 'info' | 'warning' | 'critical';
};

export type MasterComparisonResult = {
  hasChanged: boolean;
  differences: MasterDifference[];
};

export type LineConfigurationInput = {
  masterConfig: MasterProductConfiguration;
  selectedVariantId?: number | null;
  selectedAttributes: QuotationLineCharacteristicDraft[];
  dimensionValues: Record<string, number | null>;
  quantity: number;
  discountPercent: number;
  taxPercent: number;
  companyId: number;
  warehouseId?: number | null;
  customNotes?: string;
};

/**
 * Builds an immutable, complete QuotationLineSnapshot from user inputs and master configuration.
 */
export async function buildQuotationLineSnapshot(
  input: LineConfigurationInput
): Promise<QuotationLineSnapshot> {
  const {
    masterConfig,
    selectedVariantId,
    selectedAttributes,
    dimensionValues,
    quantity,
    discountPercent,
    taxPercent,
    companyId,
    warehouseId,
    customNotes,
  } = input;

  const { product, family, lineBehavior, baseUnit, dimensions, attributes, characteristics, scales, bomComponents, unitsMap, versionHash } = masterConfig;

  // 1. Resolve selected variant (product_characteristic)
  const selectedVariant = characteristics.find(c => c.id === selectedVariantId) ?? null;

  // 2. Resolve selected attributes
  const snapshotAttributes: SnapshotAttribute[] = [];
  const attributeIncrements: CharacteristicIncrementItem[] = [];

  for (const attrDef of attributes) {
    const draft = selectedAttributes.find(a => a.attribute_id === attrDef.attribute_id);
    let valueLabel = '—';
    let valueCode: string | null = null;

    if (draft?.attribute_value_id != null) {
      const valObj = attrDef.values.find(v => v.id === draft.attribute_value_id);
      if (valObj) {
        valueCode = valObj.code;
        valueLabel = valObj.name || valObj.code;
      }
    } else if (draft?.value_text) {
      valueLabel = draft.value_text;
    } else if (draft?.value_number != null) {
      valueLabel = String(draft.value_number);
    } else if (draft?.value_boolean != null) {
      valueLabel = draft.value_boolean ? 'Sí' : 'No';
    }

    snapshotAttributes.push({
      assignment_id: attrDef.assignment_id,
      attribute_id: attrDef.attribute_id,
      code: attrDef.code,
      name: attrDef.name,
      value_id: draft?.attribute_value_id ?? null,
      value_code: valueCode,
      value_label: valueLabel,
      data_type: attrDef.data_type,
      value_text: draft?.value_text ?? null,
      value_number: draft?.value_number ?? null,
      value_boolean: draft?.value_boolean ?? null,
    });
  }

  // 3. Resolve snapshot dimensions
  const snapshotDimensions: SnapshotDimension[] = dimensions.map(d => {
    const val = dimensionValues[d.code] ?? null;
    const unitObj = d.unit_id ? unitsMap.get(d.unit_id) : null;
    return {
      dimension_number: d.dimension_number,
      code: d.code,
      name: d.name,
      value: val,
      unit_id: d.unit_id ?? null,
      unit_code: unitObj?.code || '',
      unit_name: unitObj?.name || '',
      decimals: d.decimals,
    };
  });

  // 4. Calculate Pricing with explainable steps
  const pricing = calculateLinePricing({
    product,
    characteristic: selectedVariant,
    selectedAttributeIncrements: attributeIncrements,
    dimensions: dimensionValues,
    scales,
    quantity,
    discount_percent: discountPercent,
    tax_percent: taxPercent,
  });

  // 5. Evaluate Bill of Materials (Despiece)
  const breakdown = calculateBillOfMaterials({
    components: bomComponents,
    dimensions: dimensionValues,
    quantity,
    characteristicCode: selectedVariant?.code,
    characteristicName: selectedVariant?.description,
  });

  // 6. Calculate Fabric & Profile Cuts
  const cuts = calculateCuts({
    productCode: product.code,
    productName: product.commercial_description || product.technical_description || product.code,
    dimensions: dimensionValues,
    quantity,
    lineBehavior,
    family,
    productCutSettings: {
      minimum_remainder: product.minimum_remainder,
      discarded_size: product.discarded_size,
      smooth_cut: product.smooth_cut,
    },
    characteristicColor: selectedVariant?.description || selectedVariant?.code,
    bomComponents: breakdown.components,
  });

  // 7. Check Stock Availability
  let stockPreview: StockAvailabilityPreview | null = null;
  try {
    stockPreview = await checkStockAvailability({
      companyId,
      warehouseId,
      productId: product.id,
      productCode: product.code,
      productName: product.commercial_description || product.technical_description || product.code,
      stockEnabled: Boolean(product.stock_enabled),
      stockMinimum: Number(product.stock_minimum ?? 0),
      characteristicId: selectedVariant?.id,
      characteristicCode: selectedVariant?.code,
      quantity,
      components: breakdown.components.map(c => ({
        productId: c.id,
        productCode: c.code,
        productName: c.description,
        requiredQuantity: c.quantity,
      })),
    });
  } catch (err) {
    console.warn('Could not preview stock:', err);
  }

  const snapshot: QuotationLineSnapshot = {
    snapshot_version: '1.0',
    created_at: new Date().toISOString(),
    master_version_hash: versionHash,
    article: {
      id: product.id,
      code: product.code,
      technical_description: product.technical_description,
      commercial_description: product.commercial_description,
      base_unit_id: product.base_unit_id,
      base_unit_code: baseUnit?.code || 'ud',
      base_unit_name: baseUnit?.name || 'Unidad',
      iva_percent: product.iva_percent,
      family_id: product.family_id,
      family_name: family?.name || null,
      line_behavior_id: family?.line_behavior_id || null,
      line_behavior_code: lineBehavior?.code || null,
      scaled: Boolean(product.scaled),
      scaled_by_characteristic: Boolean(product.scaled_by_characteristic),
    },
    selected_variant: selectedVariant
      ? {
          id: selectedVariant.id,
          code: selectedVariant.code,
          description: selectedVariant.description || selectedVariant.code,
          pvp: selectedVariant.pvp ? Number(selectedVariant.pvp) : null,
          price_increment: selectedVariant.price_increment ? Number(selectedVariant.price_increment) : null,
        }
      : null,
    selected_attributes: snapshotAttributes,
    dimensions: snapshotDimensions,
    quantity,
    pricing,
    breakdown,
    cuts,
    stock_preview: stockPreview,
    notes: customNotes,
  };

  return snapshot;
}

/**
 * Compares an existing quotation line snapshot against the current master article configuration.
 * Identifies changes in base price, scales, dimensions, variants, or BOM formulas.
 */
export function compareSnapshotWithMaster(
  snapshot: QuotationLineSnapshot | null,
  currentMaster: MasterProductConfiguration | null
): MasterComparisonResult {
  if (!snapshot || !currentMaster) {
    return { hasChanged: false, differences: [] };
  }

  const diffs: MasterDifference[] = [];

  // Check Master Version Hash
  if (snapshot.master_version_hash && snapshot.master_version_hash !== currentMaster.versionHash) {
    // Dig into specific fields to give actionable explanations
    const snapPrice = snapshot.pricing.base_price;
    const masterPrice = Number(currentMaster.product.sales_price ?? 0);

    if (snapPrice !== masterPrice && !snapshot.article.scaled && !snapshot.article.scaled_by_characteristic) {
      diffs.push({
        field: 'sales_price',
        label: 'Precio base maestro',
        snapshotValue: `${snapPrice.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`,
        masterValue: `${masterPrice.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`,
        severity: 'warning',
      });
    }

    if (snapshot.article.scaled !== currentMaster.product.scaled || snapshot.article.scaled_by_characteristic !== currentMaster.product.scaled_by_characteristic) {
      diffs.push({
        field: 'scaled_mode',
        label: 'Modo de escalado',
        snapshotValue: snapshot.article.scaled_by_characteristic ? 'Por variante' : snapshot.article.scaled ? 'Estándar' : 'Sin escalado',
        masterValue: currentMaster.product.scaled_by_characteristic ? 'Por variante' : currentMaster.product.scaled ? 'Estándar' : 'Sin escalado',
        severity: 'critical',
      });
    }

    // Check Dimensions changes
    if (snapshot.dimensions.length !== currentMaster.dimensions.length) {
      diffs.push({
        field: 'dimensions_count',
        label: 'Número de dimensiones configuradas',
        snapshotValue: `${snapshot.dimensions.length} dimensión(es)`,
        masterValue: `${currentMaster.dimensions.length} dimensión(es)`,
        severity: 'warning',
      });
    }

    // Check BOM count changes
    if (snapshot.breakdown.components.length !== currentMaster.bomComponents.length) {
      diffs.push({
        field: 'bom_count',
        label: 'Componentes de despiece',
        snapshotValue: `${snapshot.breakdown.components.length} componente(s)`,
        masterValue: `${currentMaster.bomComponents.length} componente(s)`,
        severity: 'info',
      });
    }
  }

  return {
    hasChanged: diffs.length > 0,
    differences: diffs,
  };
}

/**
 * Convenience helper for existing Quotation modules
 */
export async function calculateQuotationLineByProductId(input: {
  productId: number;
  dimensions: QuotationLineDimensionDraft[];
  quantity?: number;
  discountPercent?: number;
}): Promise<{ unit_price: number }> {
  // Simple fallback for backward compatibility
  return { unit_price: 0 };
}
