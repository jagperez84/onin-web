import { CoreRepositoryError } from '../core/coreRepository';
import { supabase } from '../../lib/supabase';
import type { SalesOrder } from '../sales/salesOrderService';
import { deriveProfileCutNeeds, findWorkSheetForNeed, type CutNeed } from '../catalog/profileCutNeeds';
import { isFabricOrLonaComponent } from '../catalog/componentClassification';
import { listProfileStockPieces } from '../warehouse/stockRepository';
import { executeManualProfileCutWithWorkSheet, getWorkSheetsBySalesOrderLine, type WorkSheet } from './workSheetService';
import {
  allocateLonaStockForPieces,
  createLonaConfectionWorkSheet,
  probeLonaStockWidth,
  resolveLonaConfectionComponents,
  type LonaConfectionComponent,
  type LonaConfectionResult,
  type LonaConfectionWorkSheet,
} from './lonaConfectionService';
import { executeLonaConfectionWorkSheet } from './lonaConfectionExecutionService';
import { getLonaConfectionWorkSheetBySalesOrderLine } from './lonaConfectionQueryService';
import { calculateLonaCut, type LonaCutType } from './lonaCutCalculationService';
import {
  createAndExecuteComponentConsumption,
  getComponentConsumptionWorkSheetBySalesOrderLine,
  listComponentStockOptions,
  resolveOrderLineComponents,
  type ComponentConsumptionWorkSheet,
  type ComponentNeed,
  type ComponentStockOption,
} from './componentConsumptionService';

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

const DEFAULT_HEM = 3;
const DEFAULT_OVERLAP = 2.7;

/** Qué necesita una línea de pedido para considerarse totalmente fabricada. */
export type LineRequirements = {
  needsProfile: boolean;
  needsLona: boolean;
  needsComponents: boolean;
};

function lineSnapshot(line: any): any {
  return (line?.specific_data?.configuration_snapshot || line?.specific_data?.otd_snapshot || null) as any;
}

export function getLineRequirements(line: any): LineRequirements {
  const snapshot = lineSnapshot(line);
  const rawComponents: any[] = Array.isArray(snapshot?.components) ? snapshot.components : [];
  const needsProfile = deriveProfileCutNeeds(line).some(n => Boolean(n.profileId) && n.length > 0);
  const needsLona = rawComponents.some(isFabricOrLonaComponent);
  const needsComponents = resolveOrderLineComponents(line).length > 0;
  return { needsProfile, needsLona, needsComponents };
}

export async function isLineProfileDone(line: any): Promise<boolean> {
  const needs = deriveProfileCutNeeds(line);
  if (!needs.some(n => n.profileId && n.length > 0)) return true;
  const sheets = await getWorkSheetsBySalesOrderLine(Number(line.id));
  return needs.every(n => Boolean(findWorkSheetForNeed(n, sheets)));
}

export async function isLineLonaDone(line: any): Promise<boolean> {
  const requirements = getLineRequirements(line);
  if (!requirements.needsLona) return true;
  const sheet = await getLonaConfectionWorkSheetBySalesOrderLine(Number(line.id));
  return sheet?.status === 'COMPLETED';
}

export async function isLineComponentsDone(line: any): Promise<boolean> {
  const needs = resolveOrderLineComponents(line);
  if (!needs.length) return true;
  const sheet = await getComponentConsumptionWorkSheetBySalesOrderLine(Number(line.id));
  return sheet?.status === 'COMPLETED';
}

/** Selección manual de una pieza de stock para cubrir (parte de) una necesidad de perfil. */
export type ProfileManualPieceSelection = {
  warehouseId: number;
  length: number;
  quantity: number;
  characteristicId: number | null;
  characteristicCode: string | null;
};

export type LonaCutOverride = { cutType: LonaCutType; hem: number; overlap: number };

/**
 * Plan de fabricación del centro de control: qué decide el usuario para cada necesidad
 * pendiente del pedido, indexado por una clave estable por necesidad. Todo es opcional: lo
 * que no aparece en el plan se fabrica en modo automático, igual que antes.
 */
export type OrderFabricationPlan = {
  profileMode?: Record<string, 'AUTOMATIC' | 'MANUAL'>;
  profileManualSelections?: Record<string, ProfileManualPieceSelection[]>;
  lonaOverrides?: Record<string, LonaCutOverride>;
  componentWarehouse?: Record<string, number>;
};

export type ProfileNeedPreview = CutNeed & { lineId: number; key: string };
export type LonaLinePreview = { lineId: number; lineNo: number; result: LonaConfectionResult };
export type ComponentNeedPreview = { lineId: number; lineNo: number; key: string; need: ComponentNeed; options: ComponentStockOption[] };

export type OrderFabricationOverview = {
  profileNeeds: ProfileNeedPreview[];
  lonaLines: LonaLinePreview[];
  componentNeeds: ComponentNeedPreview[];
};

/**
 * Analiza el pedido completo y devuelve, agrupado por tipo de material, todo lo que queda
 * pendiente de fabricar (ya excluye líneas/necesidades ya hechas). Es la base del centro de
 * control: a partir de esto el usuario decide modo automático/manual por necesidad antes de
 * fabricar.
 */
export async function buildOrderFabricationOverview(order: SalesOrder, companyId: number): Promise<OrderFabricationOverview> {
  const lines = order.lines || [];
  const profileNeeds: ProfileNeedPreview[] = [];
  const lonaLines: LonaLinePreview[] = [];
  const componentNeeds: ComponentNeedPreview[] = [];

  for (const line of lines) {
    const lineId = Number(line.id);
    const lineNo = Number(line.line_no);
    const requirements = getLineRequirements(line);

    if (requirements.needsProfile && !(await isLineProfileDone(line))) {
      const needs = deriveProfileCutNeeds(line);
      const existingSheets = await getWorkSheetsBySalesOrderLine(lineId);
      needs
        .filter(n => !findWorkSheetForNeed(n, existingSheets))
        .forEach(n => profileNeeds.push({ ...n, lineId, key: `${lineId}:${n.id}` }));
    }

    if (requirements.needsLona && !(await isLineLonaDone(line))) {
      const snapshot = lineSnapshot(line);
      if (snapshot) {
        try {
          const result = await resolveLonaConfectionComponents({ companyId, orderLineId: lineId, orderLineNo: lineNo, reference: null, snapshot });
          lonaLines.push({ lineId, lineNo, result });
        } catch {
          // La línea sugería lona en el snapshot pero no resultó tener componentes confeccionables reales.
        }
      }
    }

    if (requirements.needsComponents && !(await isLineComponentsDone(line))) {
      const needs = resolveOrderLineComponents(line);
      for (const need of needs) {
        const options = await listComponentStockOptions(companyId, need.productId);
        componentNeeds.push({ lineId, lineNo, key: `${lineId}:${need.productId}`, need, options });
      }
    }
  }

  return { profileNeeds, lonaLines, componentNeeds };
}

export async function isLineFullyFabricated(line: any): Promise<boolean> {
  const [profile, lona, components] = await Promise.all([
    isLineProfileDone(line),
    isLineLonaDone(line),
    isLineComponentsDone(line),
  ]);
  return profile && lona && components;
}

/** Si todas las líneas del pedido están totalmente fabricadas, marca el pedido como MANUFACTURED. */
export async function checkAndMarkOrderManufactured(salesOrderId: number, lines: any[]): Promise<boolean> {
  if (!lines.length) return false;
  const results = await Promise.all(lines.map(line => isLineFullyFabricated(line)));
  const allDone = results.every(Boolean);
  if (!allDone) return false;
  const { error } = await client().rpc('mark_sales_order_manufactured', { p_sales_order_id: salesOrderId });
  if (error) throw new CoreRepositoryError(error.message);
  return true;
}

export type StepOutcome<T> =
  | { status: 'skipped' }
  | { status: 'already_done'; result: T }
  | { status: 'done'; result: T }
  | { status: 'error'; message: string };

export type LineFabricationOutcome = {
  lineId: number;
  lineNo: number;
  productCode: string | null;
  profile: StepOutcome<WorkSheet[]>;
  lona: StepOutcome<LonaConfectionWorkSheet[]>;
  components: StepOutcome<ComponentConsumptionWorkSheet | null>;
};

async function autoFabricateProfileForLine(input: {
  companyId: number;
  salesOrderId: number;
  line: any;
  reference?: string | null;
  plan?: OrderFabricationPlan;
}): Promise<WorkSheet[]> {
  const lineId = Number(input.line.id);
  const needs = deriveProfileCutNeeds(input.line);
  const existingSheets = await getWorkSheetsBySalesOrderLine(lineId);
  const pending = needs.filter(n => !findWorkSheetForNeed(n, existingSheets));
  const created: WorkSheet[] = [];

  for (const need of pending) {
    if (!need.profileId || !need.length) {
      throw new Error(`El perfil ${need.profile} no tiene una longitud de corte válida.`);
    }

    const key = `${lineId}:${need.id}`;
    const isManual = input.plan?.profileMode?.[key] === 'MANUAL';
    const manualSelection = isManual ? input.plan?.profileManualSelections?.[key] : undefined;

    let chosen: Array<{ warehouseId: number; length: number; quantity: number; characteristicId: number | null; characteristicCode: string | null }>;
    let reason: string;
    let selectionMode: 'AUTOMATIC' | 'MANUAL';

    if (isManual && manualSelection && manualSelection.length) {
      const selectedQuantity = manualSelection.reduce((sum, p) => sum + p.quantity, 0);
      if (selectedQuantity !== need.quantity) {
        throw new Error(`La selección manual de ${need.profile} (línea ${need.lineNo}) tiene ${selectedQuantity} pieza(s) y la necesidad es ${need.quantity}.`);
      }
      chosen = manualSelection;
      const remnant = chosen.reduce((sum, p) => sum + (p.length - need.length) * p.quantity, 0);
      reason = `Selección manual desde el centro de control de fabricación. Material: ${chosen.map(p => `${p.quantity} × ${p.length} ${need.unit}`).join(', ')}. Remanente: ${remnant} ${need.unit}.`;
      selectionMode = 'MANUAL';
    } else {
      const rows = await listProfileStockPieces({
        companyId: input.companyId,
        productId: need.profileId,
        productCode: need.profile,
        characteristicId: need.characteristicId,
        characteristicCode: need.characteristicCode,
        requiredLength: need.length,
      });
      const pieces = rows.slice().sort((a, b) => a.length - b.length || a.warehouseId - b.warehouseId);

      let remaining = need.quantity;
      chosen = [];
      for (const piece of pieces) {
        if (remaining <= 0) break;
        const take = Math.min(piece.quantity, remaining);
        if (take > 0) {
          chosen.push({ warehouseId: piece.warehouseId, length: piece.length, quantity: take, characteristicId: piece.characteristicId, characteristicCode: piece.characteristicCode });
          remaining -= take;
        }
      }
      if (remaining > 0) {
        throw new Error(`Stock insuficiente para ${need.profile} (${need.characteristic}): faltan ${remaining} pieza(s) de ${need.length} ${need.unit}.`);
      }

      const remnant = chosen.reduce((sum, p) => sum + (p.length - need.length) * p.quantity, 0);
      reason = `Fabricación automática del pedido completo. Material: ${chosen.map(p => `${p.quantity} × ${p.length} ${need.unit}`).join(', ')}. Remanente: ${remnant} ${need.unit}.`;
      selectionMode = 'AUTOMATIC';
    }

    const sheet = await executeManualProfileCutWithWorkSheet({
      companyId: input.companyId,
      salesOrderId: input.salesOrderId,
      salesOrderLineId: lineId,
      salesOrderLineNo: need.lineNo,
      productId: need.profileId,
      productCode: need.profile,
      productName: need.profileName,
      characteristicId: chosen[0]?.characteristicId ?? need.characteristicId ?? null,
      characteristicCode: need.characteristicCode ?? chosen[0]?.characteristicCode ?? null,
      characteristicName: need.characteristic,
      requiredLength: need.length,
      quantity: need.quantity,
      selections: chosen.map(piece => ({ warehouseId: piece.warehouseId, dimensionValues: [piece.length], quantity: piece.quantity })),
      reference: input.reference || `Corte línea ${need.lineNo} · ${need.profile}`,
      notes: `Cortar ${need.quantity} pieza(s) de ${need.length} ${need.unit}. ${reason}`,
      selectionMode,
      selectionReason: reason,
      unitSymbol: need.unit || undefined,
    });
    created.push(sheet);
  }
  return created;
}

async function autoFabricateLonaComponent(input: {
  companyId: number;
  salesOrderId: number;
  salesOrderLineId: number;
  salesOrderLineNo: number;
  component: LonaConfectionComponent;
  reference?: string | null;
  cutType?: LonaCutType;
  hem?: number;
  overlap?: number;
}): Promise<LonaConfectionWorkSheet> {
  const { component } = input;
  const cutType = input.cutType ?? 'Asimétrico';
  const hem = input.hem ?? DEFAULT_HEM;
  const overlap = input.overlap ?? DEFAULT_OVERLAP;
  if (component.line == null || component.output == null || component.line <= 0 || component.output <= 0) {
    throw new Error(`El componente de lona ${component.productCode} no tiene dimensiones válidas.`);
  }
  const probe = await probeLonaStockWidth({
    companyId: input.companyId,
    productId: component.productId,
    characteristicId: component.characteristicId,
    characteristicCode: component.characteristicCode,
  });
  if (!probe) throw new Error(`Sin material de lona compatible para ${component.productCode} (${component.characteristicName || 'sin característica'}).`);

  const calculation = calculateLonaCut({
    type: cutType,
    line: component.line,
    output: component.output,
    selectedWidth: probe.sourceDimensions[0],
    hem,
    overlap,
    stockWidth: probe.sourceDimensions[0],
    stockLength: probe.sourceDimensions[1],
    rotated: probe.rotated,
  });
  if (calculation.status !== 'CALCULATED') {
    throw new Error(`No se pudo calcular el corte de lona para ${component.productCode}.`);
  }

  const pieceAllocations = await allocateLonaStockForPieces({
    companyId: input.companyId,
    productId: component.productId,
    characteristicId: component.characteristicId,
    characteristicCode: component.characteristicCode,
    pieces: calculation.pieces.map(piece => ({ width: piece.width, length: piece.length, label: piece.label })),
    unit: component.lineUnit,
  });
  if (!pieceAllocations.length || pieceAllocations.some(a => !a.candidate)) {
    throw new Error(`Material de lona insuficiente para completar el corte de ${component.productCode}.`);
  }

  const sheet = await createLonaConfectionWorkSheet({
    companyId: input.companyId,
    salesOrderId: input.salesOrderId,
    salesOrderLineId: input.salesOrderLineId,
    salesOrderLineNo: input.salesOrderLineNo,
    component,
    allocations: pieceAllocations,
    reference: input.reference,
    selectionMode: 'AUTOMATIC',
    selectionReason: `Fabricación automática del pedido completo. Tipo de corte: ${cutType}. Dobladillo: ${hem}. Solape: ${overlap}.`,
  });
  await executeLonaConfectionWorkSheet(sheet.id);
  return { ...sheet, status: 'COMPLETED' };
}

async function autoFabricateLonaForLine(input: {
  companyId: number;
  salesOrderId: number;
  line: any;
  reference?: string | null;
  plan?: OrderFabricationPlan;
}): Promise<LonaConfectionWorkSheet[]> {
  const lineId = Number(input.line.id);
  const snapshot = lineSnapshot(input.line);
  if (!snapshot) return [];
  const result = await resolveLonaConfectionComponents({
    companyId: input.companyId,
    orderLineId: lineId,
    orderLineNo: Number(input.line.line_no),
    reference: input.reference,
    snapshot,
  });
  if (!result.components.length) return [];

  const existing = await getLonaConfectionWorkSheetBySalesOrderLine(lineId);
  if (existing?.status === 'COMPLETED') return [existing];

  const created: LonaConfectionWorkSheet[] = [];
  for (const component of result.components) {
    const override = input.plan?.lonaOverrides?.[`${lineId}:${component.index}`];
    const sheet = await autoFabricateLonaComponent({
      companyId: input.companyId,
      salesOrderId: input.salesOrderId,
      salesOrderLineId: lineId,
      salesOrderLineNo: Number(input.line.line_no),
      component,
      reference: input.reference,
      cutType: override?.cutType,
      hem: override?.hem,
      overlap: override?.overlap,
    });
    created.push(sheet);
  }
  return created;
}

async function autoFabricateComponentsForLine(input: {
  companyId: number;
  salesOrderId: number;
  line: any;
  orderWarehouseId?: number | null;
  reference?: string | null;
  plan?: OrderFabricationPlan;
}): Promise<ComponentConsumptionWorkSheet | null> {
  const lineId = Number(input.line.id);
  const needs = resolveOrderLineComponents(input.line);
  if (!needs.length) return null;

  const existing = await getComponentConsumptionWorkSheetBySalesOrderLine(lineId);
  if (existing?.status === 'COMPLETED') return existing;

  const lines: Array<{ warehouseId: number; productId: number; productCode: string; productName: string; unitCode: string; quantity: number }> = [];
  for (const need of needs) {
    const options = await listComponentStockOptions(input.companyId, need.productId);
    const overrideWarehouseId = input.plan?.componentWarehouse?.[`${lineId}:${need.productId}`];
    const overridden = overrideWarehouseId != null ? options.find(o => o.warehouseId === overrideWarehouseId) : null;
    const preferred = input.orderWarehouseId ? options.find(o => o.warehouseId === input.orderWarehouseId) : null;
    const chosen = overridden ?? preferred ?? options[0];
    if (!chosen) throw new Error(`Sin almacén con existencias de ${need.productCode} para descontar.`);
    lines.push({ warehouseId: chosen.warehouseId, productId: need.productId, productCode: need.productCode, productName: need.productName, unitCode: need.unitCode, quantity: need.quantity });
  }

  return createAndExecuteComponentConsumption({
    companyId: input.companyId,
    salesOrderId: input.salesOrderId,
    salesOrderLineId: Number(input.line.id),
    salesOrderLineNo: Number(input.line.line_no),
    productId: input.line.product_id ?? null,
    productCode: input.line.product_code ?? null,
    productName: input.line.description ?? null,
    quantity: Number(input.line.quantity) || 1,
    reference: input.reference,
    lines,
  });
}

/** Fabrica automáticamente todo lo pendiente de una línea (perfil, lona, componentes), lo que aplique. */
export async function fabricateOrderLine(input: {
  companyId: number;
  salesOrderId: number;
  orderWarehouseId?: number | null;
  reference?: string | null;
  line: any;
  plan?: OrderFabricationPlan;
}): Promise<LineFabricationOutcome> {
  const requirements = getLineRequirements(input.line);
  const outcome: LineFabricationOutcome = {
    lineId: Number(input.line.id),
    lineNo: Number(input.line.line_no),
    productCode: input.line.product_code ?? null,
    profile: { status: 'skipped' },
    lona: { status: 'skipped' },
    components: { status: 'skipped' },
  };

  if (requirements.needsProfile) {
    try {
      const alreadyDone = await isLineProfileDone(input.line);
      if (alreadyDone) {
        outcome.profile = { status: 'already_done', result: await getWorkSheetsBySalesOrderLine(Number(input.line.id)) };
      } else {
        const created = await autoFabricateProfileForLine({ companyId: input.companyId, salesOrderId: input.salesOrderId, line: input.line, reference: input.reference, plan: input.plan });
        outcome.profile = { status: 'done', result: created };
      }
    } catch (err) {
      outcome.profile = { status: 'error', message: err instanceof Error ? err.message : 'No se pudo cortar el perfil.' };
    }
  }

  if (requirements.needsLona) {
    try {
      const alreadyDone = await isLineLonaDone(input.line);
      if (alreadyDone) {
        const sheet = await getLonaConfectionWorkSheetBySalesOrderLine(Number(input.line.id));
        outcome.lona = { status: 'already_done', result: sheet ? [sheet] : [] };
      } else {
        const created = await autoFabricateLonaForLine({ companyId: input.companyId, salesOrderId: input.salesOrderId, line: input.line, reference: input.reference, plan: input.plan });
        outcome.lona = { status: 'done', result: created };
      }
    } catch (err) {
      outcome.lona = { status: 'error', message: err instanceof Error ? err.message : 'No se pudo confeccionar la lona.' };
    }
  }

  if (requirements.needsComponents) {
    try {
      const alreadyDone = await isLineComponentsDone(input.line);
      if (alreadyDone) {
        const sheet = await getComponentConsumptionWorkSheetBySalesOrderLine(Number(input.line.id));
        outcome.components = { status: 'already_done', result: sheet };
      } else {
        const sheet = await autoFabricateComponentsForLine({ companyId: input.companyId, salesOrderId: input.salesOrderId, line: input.line, orderWarehouseId: input.orderWarehouseId, reference: input.reference, plan: input.plan });
        outcome.components = { status: 'done', result: sheet };
      }
    } catch (err) {
      outcome.components = { status: 'error', message: err instanceof Error ? err.message : 'No se pudieron descontar los componentes.' };
    }
  }

  return outcome;
}

/** Fabrica automáticamente el pedido completo, línea a línea, y marca el pedido como fabricado si todo queda hecho. */
export async function fabricateWholeOrder(order: SalesOrder, companyId: number, plan?: OrderFabricationPlan): Promise<{ outcomes: LineFabricationOutcome[]; orderManufactured: boolean }> {
  const lines = order.lines || [];
  const orderWarehouseId = (order as any).warehouse_id == null ? null : Number((order as any).warehouse_id);
  const outcomes: LineFabricationOutcome[] = [];
  for (const line of lines) {
    const outcome = await fabricateOrderLine({
      companyId,
      salesOrderId: order.id,
      orderWarehouseId,
      reference: `${order.code}${order.reference ? ` · ${order.reference}` : ''}`,
      line,
      plan,
    });
    outcomes.push(outcome);
  }
  const orderManufactured = await checkAndMarkOrderManufactured(order.id, lines);
  return { outcomes, orderManufactured };
}
