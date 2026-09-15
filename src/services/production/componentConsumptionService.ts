import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { isProfileComponent, isFabricOrLonaComponent } from '../catalog/componentClassification';

function client() { if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.'); return supabase; }

export type ComponentNeed = {
  productId: number;
  productCode: string;
  productName: string;
  unitCode: string;
  quantity: number;
  characteristicId: number | null;
  characteristicCode: string | null;
  characteristicName: string | null;
  colorId: number | null;
  colorCode: string | null;
  colorName: string | null;
};

/** Un componente del despiece cuenta como "componente por unidades" si no es el perfil ni la tela/lona
 *  (esos ya se descuentan mediante sus propias hojas de corte/confección) y referencia un artículo real. */
function isAccessoryComponent(c: any): boolean {
  if (!c || c.product_id == null) return false;
  return !isProfileComponent(c) && !isFabricOrLonaComponent(c);
}

export function resolveOrderLineComponents(line: any): ComponentNeed[] {
  const snapshot = (line?.specific_data?.configuration_snapshot || line?.specific_data?.otd_snapshot || null) as any;
  const rawComponents: any[] = Array.isArray(snapshot?.components) ? snapshot.components : [];
  const accessoryComponents = rawComponents.filter(isAccessoryComponent);

  const byKey = new Map<string, ComponentNeed>();
  for (const c of accessoryComponents) {
    const productId = Number(c.product_id);
    const quantity = Number(c.quantity) || 0;
    if (!Number.isFinite(productId) || quantity <= 0) continue;
    const characteristicId = c.characteristic_id ? Number(c.characteristic_id) : null;
    const colorId = c.color_id ? Number(c.color_id) : null;
    const key = `${productId}:${characteristicId ?? ''}:${colorId ?? ''}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += quantity;
    } else {
      byKey.set(key, {
        productId,
        productCode: c.product_code || c.code || `P-${productId}`,
        productName: c.product_name || c.description || `Componente ${productId}`,
        unitCode: c.unit_code || c.unit_symbol || 'ud',
        quantity,
        characteristicId,
        characteristicCode: c.characteristic_code || null,
        characteristicName: c.characteristic_name || null,
        colorId,
        colorCode: c.color_code || null,
        colorName: c.color_name || null
      });
    }
  }
  return Array.from(byKey.values());
}

export type ComponentStockOption = { warehouseId: number; warehouseCode: string; warehouseName: string; available: number };

export async function listComponentStockOptions(
  companyId: number,
  productId: number,
  characteristicId: number | null = null,
  colorId: number | null = null
): Promise<ComponentStockOption[]> {
  const c = client();
  const { data, error } = await c
    .from('warehouse_stock')
    .select('quantity,reserved_quantity,characteristic_id,color_id,warehouse!inner(id,code,name,company_id,deleted_at)')
    .eq('product_id', productId)
    .eq('warehouse.company_id', companyId)
    .is('warehouse.deleted_at', null);
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? [])
    .filter((r: any) => {
      const rowCharId = r.characteristic_id == null ? null : Number(r.characteristic_id);
      const rowColorId = r.color_id == null ? null : Number(r.color_id);
      if (characteristicId != null) {
        if (rowCharId !== characteristicId) return false;
        return colorId != null ? rowColorId === colorId : rowColorId === null;
      }
      return rowCharId === null && rowColorId === null;
    })
    .map((r: any) => ({
      warehouseId: Number(r.warehouse?.id),
      warehouseCode: r.warehouse?.code ?? '—',
      warehouseName: r.warehouse?.name ?? '—',
      available: Math.max(0, Number(r.quantity || 0) - Number(r.reserved_quantity || 0))
    }))
    .filter(x => Number.isFinite(x.warehouseId))
    .sort((a, b) => b.available - a.available);
}

export type ComponentConsumptionLine = {
  id: number;
  lineNo: number;
  warehouseId: number;
  warehouseCode: string | null;
  warehouseName: string | null;
  productId: number | null;
  productCode: string | null;
  productName: string | null;
  unitCode: string | null;
  quantity: number;
  characteristicName: string | null;
  colorName: string | null;
};

export type ComponentConsumptionWorkSheet = {
  id: number;
  code: string;
  status: string;
  issueDate: string;
  salesOrderLineId: number | null;
  salesOrderLineNo: number | null;
  quantity: number;
  reference: string | null;
  notes: string | null;
  createdBy: string | null;
  lines: ComponentConsumptionLine[];
};

function mapSheet(row: any): ComponentConsumptionWorkSheet {
  return {
    id: Number(row.id),
    code: row.code,
    status: row.status,
    issueDate: row.issue_date,
    salesOrderLineId: row.sales_order_line_id == null ? null : Number(row.sales_order_line_id),
    salesOrderLineNo: row.sales_order_line_no == null ? null : Number(row.sales_order_line_no),
    quantity: Number(row.quantity || 0),
    reference: row.reference ?? null,
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    lines: (row.lines || [])
      .sort((a: any, b: any) => Number(a.line_no) - Number(b.line_no))
      .map((l: any) => ({
        id: Number(l.id),
        lineNo: Number(l.line_no),
        warehouseId: Number(l.warehouse_id),
        warehouseCode: l.warehouse_code ?? null,
        warehouseName: l.warehouse_name ?? null,
        productId: l.component_product_id == null ? null : Number(l.component_product_id),
        productCode: l.component_product_code ?? null,
        productName: l.component_product_name ?? null,
        unitCode: l.component_unit_code ?? null,
        quantity: Number(l.quantity || 0),
        characteristicName: l.component_characteristic_name ?? null,
        colorName: l.component_color_name ?? null
      }))
  };
}

export async function getComponentConsumptionWorkSheetBySalesOrderLine(salesOrderLineId: number): Promise<ComponentConsumptionWorkSheet | null> {
  const c = client();
  const { data, error } = await c
    .from('production_work_sheet')
    .select('*,lines:production_work_sheet_line(*)')
    .eq('sales_order_line_id', salesOrderLineId)
    .eq('document_type', 'COMPONENT_CONSUMPTION')
    .order('issue_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  return data ? mapSheet(data) : null;
}

export async function createAndExecuteComponentConsumption(input: {
  companyId: number;
  salesOrderId: number;
  salesOrderLineId: number;
  salesOrderLineNo: number;
  productId: number | null;
  productCode: string | null;
  productName: string | null;
  quantity: number;
  lines: Array<{
    warehouseId: number;
    productId: number;
    productCode: string;
    productName: string;
    unitCode: string;
    quantity: number;
    characteristicId?: number | null;
    characteristicCode?: string | null;
    characteristicName?: string | null;
    colorId?: number | null;
    colorCode?: string | null;
    colorName?: string | null;
  }>;
  reference?: string | null;
  notes?: string | null;
}): Promise<ComponentConsumptionWorkSheet> {
  if (!input.salesOrderId || !input.salesOrderLineId) throw new CoreRepositoryError('El consumo de componentes debe estar vinculado a una línea de pedido.');
  if (!input.lines.length) throw new CoreRepositoryError('No hay componentes que descontar.');
  const c = client();
  const { data, error } = await c.rpc('create_and_execute_component_consumption_work_sheet', {
    p_company_id: input.companyId,
    p_sales_order_id: input.salesOrderId,
    p_sales_order_line_id: input.salesOrderLineId,
    p_sales_order_line_no: input.salesOrderLineNo,
    p_product_id: input.productId,
    p_product_code: input.productCode,
    p_product_name: input.productName,
    p_quantity: input.quantity,
    p_lines: input.lines.map(l => ({
      warehouse_id: l.warehouseId,
      product_id: l.productId,
      product_code: l.productCode,
      product_name: l.productName,
      unit_code: l.unitCode,
      quantity: l.quantity,
      characteristic_id: l.characteristicId ?? null,
      characteristic_code: l.characteristicCode ?? null,
      characteristic_name: l.characteristicName ?? null,
      color_id: l.colorId ?? null,
      color_code: l.colorCode ?? null,
      color_name: l.colorName ?? null
    })),
    p_reference: input.reference ?? null,
    p_notes: input.notes ?? null
  });
  if (error) throw new CoreRepositoryError(error.message);
  const sheet = await getComponentConsumptionWorkSheetBySalesOrderLine(input.salesOrderLineId);
  if (!sheet) throw new CoreRepositoryError('La hoja de componentes se ha generado pero no se ha podido recuperar.');
  return sheet;
}
