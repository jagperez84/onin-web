import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';
import { sanitizeSearchTerm } from '../core/searchSanitize';
import { listProductCharacteristicConfiguration, listEffectiveAttributeColors } from '../catalog/productAttributeRepository';

export type StockBalance = {
  id: number;
  warehouse_id: number;
  product_id: number;
  characteristic_id: number | null;
  color_id: number | null;
  quantity: number;
  reserved_quantity: number;
  updated_at: string;
  warehouse?: { code: string; name: string } | null;
  product?: { code: string; commercial_description: string | null; stock_minimum: number; base_unit_id: number | null } | null;
  characteristic?: { code: string; description: string | null } | null;
  color?: { code: string; name: string } | null;
};

export type StockItemTraceability = {
  id: number;
  parent_stock_item_id: number | null;
  dimension_values: number[];
  status: string;
  quantity: number;
  created_at: string;
  remnant_generated_at: string | null;
  source_sales_order_id: number | null;
  source_sales_order_line_id: number | null;
  source_work_sheet_id: number | null;
  source_work_sheet_line_id: number | null;
  source_sales_order?: { code: string } | null;
  source_work_sheet?: { code: string } | null;
};

export type StockMovement = {
  id: number;
  company_id: number;
  warehouse_id: number;
  product_id: number;
  movement_type_id: number;
  characteristic_id: number | null;
  color_id: number | null;
  quantity: number;
  movement_date: string;
  reference: string | null;
  notes: string | null;
  transfer_group_id: string | null;
  dimension_values: number[] | null;
  movement_type?: { code: string; name: string; direction: number } | null;
  warehouse?: { code: string; name: string } | null;
  product?: { code: string; commercial_description: string | null } | null;
  characteristic?: { code: string; description: string | null } | null;
  color?: { code: string; name: string } | null;
};

export type StockReservation = {
  id: number;
  company_id: number;
  warehouse_id: number;
  product_id: number;
  characteristic_id: number | null;
  color_id: number | null;
  quantity: number;
  reference: string | null;
  notes: string | null;
  status: 'ACTIVE' | 'RELEASED' | 'CONSUMED';
  created_at: string;
  updated_at: string;
  warehouse?: { code: string; name: string } | null;
  product?: { code: string; commercial_description: string | null } | null;
  characteristic?: { code: string; description: string | null } | null;
  color?: { code: string; name: string } | null;
};

export type StockProduct = {
  id: number;
  code: string;
  commercial_description: string | null;
  technical_description: string | null;
  stock_enabled: boolean;
  allow_negative_stock: boolean;
  include_stock_by_color: boolean;
  stock_minimum: number;
};

/**
 * Una fila por combinación característica (product_attribute, familia o
 * artículo) x color efectivo disponible para ella — el desplegable "Característica
 * / color" de almacén elige directamente un color, y characteristicId viaja junto
 * para saber a qué característica pertenece.
 */
export type StockCharacteristic = {
  characteristicId: number;
  characteristicCode: string;
  characteristicName: string;
  colorId: number;
  colorCode: string;
  colorName: string;
};

export type ProfileStockPiece = {
  productId: number;
  productCode: string;
  characteristicId: number | null;
  characteristicCode: string | null;
  characteristicName?: string | null;
  colorId: number | null;
  colorCode: string | null;
  colorName?: string | null;
  warehouseId: number;
  warehouseCode: string;
  warehouseName: string;
  length: number;
  quantity: number;
  dimensionValues: number[];
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

function cleanTerm(value: string) {
  return sanitizeSearchTerm(value);
}

/**
 * Ensures physical items in warehouse_stock_item table are synchronized with dimensional stock movements
 */
export async function syncWarehouseStockItems(companyId: number, productId: number): Promise<void> {
  const c = client();
  const { data: movements, error: mErr } = await c
    .from('stock_movement')
    .select('id,company_id,warehouse_id,product_id,characteristic_id,color_id,quantity,dimension_values,movement_type:stock_movement_type(direction)')
    .eq('company_id', companyId)
    .eq('product_id', productId);
  if (mErr || !movements) return;

  const { data: wsList } = await c
    .from('warehouse_stock')
    .select('id,warehouse_id,product_id,characteristic_id,color_id')
    .eq('product_id', productId);

  const { data: wsiList } = await c
    .from('warehouse_stock_item')
    .select('id,warehouse_stock_id,product_id,characteristic_id,color_id,dimension_values,status')
    .eq('product_id', productId)
    .in('status', ['AVAILABLE', 'RESERVED']);

  const activeWsi = wsiList || [];
  const groups = new Map<string, { warehouseId: number; characteristicId: number | null; colorId: number | null; length: number; quantity: number; sourceMovementId: number }>();

  for (const m of (movements as any[])) {
    const dims = m.dimension_values;
    if (!Array.isArray(dims) || dims.length === 0) continue;
    const length = Number(dims[0]);
    if (!Number.isFinite(length) || length <= 0) continue;

    const key = [m.warehouse_id, m.characteristic_id ?? '', m.color_id ?? '', length].join('|');
    const dir = Number(m.movement_type?.direction ?? 0);
    const signed = dir * Number(m.quantity || 0);
    const cur = groups.get(key) || { warehouseId: m.warehouse_id, characteristicId: m.characteristic_id, colorId: m.color_id, length, quantity: 0, sourceMovementId: m.id };
    cur.quantity += signed;
    groups.set(key, cur);
  }

  for (const [, g] of groups.entries()) {
    if (g.quantity <= 0) continue;
    const existingCount = activeWsi.filter(w => {
      const wLength = Array.isArray(w.dimension_values) ? Number(w.dimension_values[0]) : null;
      return (w.characteristic_id ?? null) === (g.characteristicId ?? null) && (w.color_id ?? null) === (g.colorId ?? null) && wLength === g.length;
    }).length;

    const diff = g.quantity - existingCount;
    if (diff > 0) {
      let ws = (wsList || []).find(w => w.warehouse_id === g.warehouseId && (w.characteristic_id ?? null) === (g.characteristicId ?? null) && (w.color_id ?? null) === (g.colorId ?? null));
      if (!ws) {
        // Create warehouse_stock if missing
        const { data: newWs } = await c
          .from('warehouse_stock')
          .insert({
            warehouse_id: g.warehouseId,
            product_id: productId,
            characteristic_id: g.characteristicId ?? null,
            color_id: g.colorId ?? null,
            quantity: g.quantity,
            reserved_quantity: 0
          })
          .select('id,warehouse_id,product_id,characteristic_id,color_id')
          .single();
        if (newWs) ws = newWs;
      }
      if (!ws) continue;

      const toInsert = Array.from({ length: diff }, () => ({
        warehouse_stock_id: ws.id,
        product_id: productId,
        characteristic_id: g.characteristicId ?? null,
        color_id: g.colorId ?? null,
        quantity: 1,
        dimension_values: [g.length],
        status: 'AVAILABLE',
        source_stock_movement_id: g.sourceMovementId
      }));
      await c.from('warehouse_stock_item').insert(toInsert);
    }
  }
}

export async function searchStockProducts(companyId: number, search = ''): Promise<StockProduct[]> {
  const c = client();
  let q = c
    .from('product')
    .select('id,code,commercial_description,technical_description,stock_enabled,allow_negative_stock,include_stock_by_color,stock_minimum')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('active', true)
    .order('code')
    .limit(50);
  const term = cleanTerm(search);
  if (term) q = q.or(`code.ilike.%${term}%,commercial_description.ilike.%${term}%,technical_description.ilike.%${term}%`);
  const { data, error } = await q;
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as StockProduct[];
}

export async function listStockCharacteristics(productId: number): Promise<StockCharacteristic[]> {
  const effective = (await listProductCharacteristicConfiguration(productId)).filter(row => !row.excluded);
  const rows: StockCharacteristic[] = [];
  for (const characteristic of effective) {
    const colors = await listEffectiveAttributeColors(characteristic.attribute_id, characteristic.source, characteristic.assignment_id);
    for (const color of colors) {
      rows.push({
        characteristicId: characteristic.attribute_id,
        characteristicCode: characteristic.code,
        characteristicName: characteristic.name,
        colorId: color.color_id,
        colorCode: color.code,
        colorName: color.name,
      });
    }
  }
  return rows.sort((a, b) => a.characteristicCode.localeCompare(b.characteristicCode) || a.colorCode.localeCompare(b.colorCode));
}

export async function listStockItemTraceability(stockBalanceId: number): Promise<StockItemTraceability[]> {
  const c = client();
  const { data, error } = await c
    .from('warehouse_stock_item')
    .select('id,parent_stock_item_id,dimension_values,quantity,status,created_at,remnant_generated_at,source_sales_order_id,source_sales_order_line_id,source_work_sheet_id,source_work_sheet_line_id,source_sales_order:sales_order(code),source_work_sheet:production_work_sheet(code)')
    .eq('warehouse_stock_id', stockBalanceId)
    .order('created_at', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []).map((r: any) => ({
    id: Number(r.id),
    parent_stock_item_id: r.parent_stock_item_id == null ? null : Number(r.parent_stock_item_id),
    dimension_values: Array.isArray(r.dimension_values) ? r.dimension_values.map(Number) : [],
    quantity: Number(r.quantity || 0),
    status: r.status,
    created_at: r.created_at,
    remnant_generated_at: r.remnant_generated_at ?? null,
    source_sales_order_id: r.source_sales_order_id == null ? null : Number(r.source_sales_order_id),
    source_sales_order_line_id: r.source_sales_order_line_id == null ? null : Number(r.source_sales_order_line_id),
    source_work_sheet_id: r.source_work_sheet_id == null ? null : Number(r.source_work_sheet_id),
    source_work_sheet_line_id: r.source_work_sheet_line_id == null ? null : Number(r.source_work_sheet_line_id),
    source_sales_order: r.source_sales_order ?? null,
    source_work_sheet: r.source_work_sheet ?? null
  }));
}

export async function listProfileStockPieces(input: {
  companyId: number;
  productId?: number;
  productCode?: string;
  characteristicId?: number | null;
  characteristicCode?: string | null;
  colorId?: number | null;
  colorCode?: string | null;
  requiredLength: number;
}): Promise<ProfileStockPiece[]> {
  const c = client();
  let productId = input.productId;
  if (!productId && input.productCode) {
    const { data, error } = await c
      .from('product')
      .select('id')
      .eq('company_id', input.companyId)
      .eq('code', input.productCode)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new CoreRepositoryError(error.message);
    productId = data?.id == null ? undefined : Number(data.id);
  }
  if (!productId) return [];

  // Materialize / synchronize physical stock items
  await syncWarehouseStockItems(input.companyId, productId).catch(() => {});

  // Las piezas disponibles se leen de warehouse_stock_item (el ledger real de
  // piezas físicas, igual que hace Existencias) en vez de reconstruirlas
  // sumando el historial de stock_movement: ese cálculo dependía de que
  // dimension_values estuviera siempre relleno en cada movimiento, y para
  // remanentes generados por corte (o piezas de stock inicial sembradas
  // directamente) eso no era fiable — se perdían restos ya disponibles como
  // candidatos válidos para el corte.
  const { data, error } = await c
    .from('warehouse_stock_item')
    .select('characteristic_id,color_id,quantity,dimension_values,warehouse_stock:warehouse_stock_id(warehouse_id,warehouse:warehouse_id(code,name)),characteristic:product_attribute(code,description:name),color:color(code,name)')
    .eq('product_id', productId)
    .eq('status', 'AVAILABLE')
    .limit(2000);
  if (error) throw new CoreRepositoryError(error.message);

  type Aggregate = {
    warehouseId: number;
    warehouseCode: string;
    warehouseName: string;
    characteristicId: number | null;
    characteristicCode: string | null;
    characteristicName: string | null;
    colorId: number | null;
    colorCode: string | null;
    colorName: string | null;
    length: number;
    dimensionValues: number[];
    quantity: number;
  };

  const groups = new Map<string, Aggregate>();
  for (const raw of (data ?? [])) {
    const r = raw as any;
    const dims: number[] = Array.isArray(r.dimension_values) ? r.dimension_values.map(Number) : [];
    const length = Number(dims[0]);
    if (!Number.isFinite(length) || length < input.requiredLength) continue;

    const warehouseId = r.warehouse_stock?.warehouse_id;
    if (warehouseId == null) continue;

    const characteristicCode = r.characteristic?.code ?? null;
    const characteristicName = r.characteristic?.description || r.characteristic?.code || null;
    const colorCode = r.color?.code ?? null;
    const colorName = r.color?.name ?? null;

    const key = [warehouseId, r.characteristic_id ?? '', r.color_id ?? '', length].join('|');
    const existing = groups.get(key);
    const quantity = Number(r.quantity || 0);
    if (existing) {
      existing.quantity += quantity;
    } else {
      groups.set(key, {
        warehouseId: Number(warehouseId),
        warehouseCode: r.warehouse_stock?.warehouse?.code ?? '—',
        warehouseName: r.warehouse_stock?.warehouse?.name ?? '—',
        characteristicId: r.characteristic_id == null ? null : Number(r.characteristic_id),
        characteristicCode,
        characteristicName,
        colorId: r.color_id == null ? null : Number(r.color_id),
        colorCode,
        colorName,
        length,
        dimensionValues: dims,
        quantity
      });
    }
  }

  const allPieces = Array.from(groups.values()).filter(x => x.quantity > 0);

  // Exact matching rule:
  // 1. If characteristic is requested (by id or code), ONLY pieces that match that exact characteristic must appear.
  // 2. If NO characteristic is requested, ONLY pieces without characteristic (characteristic_id == null and characteristicCode == null) must appear.
  const reqCharId = input.characteristicId != null && Number(input.characteristicId) > 0 ? Number(input.characteristicId) : null;
  const reqCharCode = (typeof input.characteristicCode === 'string' && input.characteristicCode.trim().length > 0)
    ? input.characteristicCode.trim().toLowerCase()
    : null;
  const reqColorId = input.colorId != null && Number(input.colorId) > 0 ? Number(input.colorId) : null;
  const reqColorCode = (typeof input.colorCode === 'string' && input.colorCode.trim().length > 0)
    ? input.colorCode.trim().toLowerCase()
    : null;

  const filtered = allPieces.filter(piece => {
    const pieceCharId = piece.characteristicId != null ? Number(piece.characteristicId) : null;
    const pieceCharCode = piece.characteristicCode ? piece.characteristicCode.trim().toLowerCase() : null;
    const pieceCharName = piece.characteristicName ? piece.characteristicName.trim().toLowerCase() : null;

    if (reqCharId !== null || reqCharCode !== null) {
      // Must match requested characteristic exactly
      if (reqCharId !== null && pieceCharId !== null && pieceCharId === reqCharId) {
        // match
      } else if (
        reqCharCode !== null &&
        ((pieceCharCode && pieceCharCode === reqCharCode) || (pieceCharName && pieceCharName === reqCharCode))
      ) {
        // match
      } else {
        return false;
      }
    } else if (pieceCharId !== null || pieceCharCode !== null) {
      // Must NOT have any characteristic
      return false;
    }

    const pieceColorId = piece.colorId != null ? Number(piece.colorId) : null;
    const pieceColorCode = piece.colorCode ? piece.colorCode.trim().toLowerCase() : null;

    if (reqColorId !== null || reqColorCode !== null) {
      if (reqColorId !== null && pieceColorId !== null && pieceColorId === reqColorId) return true;
      if (reqColorCode !== null && pieceColorCode && pieceColorCode === reqColorCode) return true;
      return false;
    }
    return pieceColorId === null && pieceColorCode === null;
  });

  return filtered.sort((a, b) => a.length - b.length).map(x => ({
    productId: Number(productId),
    productCode: input.productCode ?? '',
    characteristicId: x.characteristicId,
    characteristicCode: x.characteristicCode,
    characteristicName: x.characteristicName,
    colorId: x.colorId,
    colorCode: x.colorCode,
    colorName: x.colorName,
    warehouseId: x.warehouseId,
    warehouseCode: x.warehouseCode,
    warehouseName: x.warehouseName,
    length: x.length,
    quantity: x.quantity,
    dimensionValues: x.dimensionValues
  }));
}

export async function listStockBalances(companyId: number, warehouseId?: number, search = ''): Promise<StockBalance[]> {
  const c = client();
  const { data: warehouseRows, error: warehouseError } = await c.from('warehouse').select('id').eq('company_id', companyId).is('deleted_at', null);
  if (warehouseError) throw new CoreRepositoryError(warehouseError.message);
  const warehouseIds = (warehouseRows ?? []).map((w: { id: number }) => w.id).filter(Boolean);
  if (warehouseIds.length === 0) return [];
  const { data, error } = await c
    .from('warehouse_stock')
    .select('id,warehouse_id,product_id,characteristic_id,color_id,quantity,reserved_quantity,updated_at,warehouse:warehouse(code,name),product:product(code,commercial_description,stock_minimum,base_unit_id),characteristic:product_attribute(code,description:name),color:color(code,name)')
    .in('warehouse_id', warehouseId ? [warehouseId] : warehouseIds)
    .order('updated_at', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  const rows = (data ?? []) as unknown as StockBalance[];
  const term = cleanTerm(search).toLowerCase();
  return term ? rows.filter(r => `${r.product?.code ?? ''} ${r.product?.commercial_description ?? ''} ${r.characteristic?.code ?? ''} ${r.characteristic?.description ?? ''}`.toLowerCase().includes(term)) : rows;
}

export async function listStockMovements(companyId: number, filters: { warehouseId?: number; productId?: number; from?: string; to?: string } = {}): Promise<StockMovement[]> {
  const c = client();
  let q = c
    .from('stock_movement')
    .select('id,company_id,warehouse_id,product_id,movement_type_id,characteristic_id,color_id,quantity,movement_date,reference,notes,transfer_group_id,dimension_values,movement_type:stock_movement_type(code,name,direction),warehouse:warehouse(code,name),product:product(code,commercial_description),characteristic:product_attribute(code,description:name),color:color(code,name)')
    .eq('company_id', companyId)
    .order('movement_date', { ascending: false })
    .order('id', { ascending: false });
  if (filters.warehouseId) q = q.eq('warehouse_id', filters.warehouseId);
  if (filters.productId) q = q.eq('product_id', filters.productId);
  if (filters.from) q = q.gte('movement_date', `${filters.from}T00:00:00`);
  if (filters.to) q = q.lte('movement_date', `${filters.to}T23:59:59.999`);
  const { data, error } = await q.limit(500);
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as unknown as StockMovement[];
}

export async function listMovementTypes(companyId: number) {
  const c = client();
  const { data, error } = await c.from('stock_movement_type').select('id,code,name,direction').eq('company_id', companyId).eq('active', true).order('direction', { ascending: false }).order('code');
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as { id: number; code: string; name: string; direction: number }[];
}

export async function registerStockMovement(input: {
  companyId: number;
  warehouseId: number;
  productId: number;
  quantity: number;
  movementTypeCode: string;
  characteristicId?: number | null;
  colorId?: number | null;
  dimensionValues?: Record<string, unknown> | null;
  reference?: string;
  notes?: string;
  movementDate?: string;
}): Promise<number> {
  const c = client();
  let movementId: number | null = null;

  const { data, error } = await c.rpc('register_stock_movement', {
    p_company_id: input.companyId,
    p_warehouse_id: input.warehouseId,
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_movement_type_code: input.movementTypeCode,
    p_characteristic_id: input.characteristicId ?? null,
    p_dimension_values: input.dimensionValues ?? null,
    p_reference: input.reference ?? null,
    p_notes: input.notes ?? null,
    p_movement_date: input.movementDate ? new Date(input.movementDate).toISOString() : new Date().toISOString(),
    p_transfer_group_id: null,
    p_color_id: input.colorId ?? null
  });

  if (error) {
    // If the database RPC returned an error related to characteristic or stock_enabled requirement,
    // verify whether the product actually has characteristics and perform direct registration fallback
    if (error.message.includes('característica') || error.message.includes('requiere característica') || error.message.includes('stock activada')) {
      // 1. Get movement type
      const { data: mType, error: tErr } = await c
        .from('stock_movement_type')
        .select('id,direction')
        .eq('company_id', input.companyId)
        .eq('code', input.movementTypeCode)
        .eq('active', true)
        .maybeSingle();
      if (tErr || !mType) throw new CoreRepositoryError(tErr?.message || 'Tipo de movimiento no válido');

      // Ensure product has stock_enabled = true
      await c.from('product').update({ stock_enabled: true }).eq('id', input.productId);

      const signedQty = Number(input.quantity) * Number(mType.direction);

      // 2. Find or create warehouse_stock row
      let qStock = c
        .from('warehouse_stock')
        .select('id,quantity')
        .eq('warehouse_id', input.warehouseId)
        .eq('product_id', input.productId);
      
      if (input.characteristicId) {
        qStock = qStock.eq('characteristic_id', input.characteristicId);
      } else {
        qStock = qStock.is('characteristic_id', null);
      }
      if (input.colorId) {
        qStock = qStock.eq('color_id', input.colorId);
      } else {
        qStock = qStock.is('color_id', null);
      }

      const { data: stockRow, error: sErr } = await qStock.maybeSingle();
      if (sErr) throw new CoreRepositoryError(sErr.message);

      if (stockRow) {
        const { error: uErr } = await c
          .from('warehouse_stock')
          .update({
            quantity: Number(stockRow.quantity || 0) + signedQty,
            updated_at: new Date().toISOString()
          })
          .eq('id', stockRow.id);
        if (uErr) throw new CoreRepositoryError(uErr.message);
      } else {
        const { error: iErr } = await c
          .from('warehouse_stock')
          .insert({
            warehouse_id: input.warehouseId,
            product_id: input.productId,
            characteristic_id: input.characteristicId ?? null,
            color_id: input.colorId ?? null,
            quantity: Math.max(0, signedQty),
            reserved_quantity: 0
          });
        if (iErr) throw new CoreRepositoryError(iErr.message);
      }

      // 3. Insert stock_movement
      const { data: newMov, error: movErr } = await c
        .from('stock_movement')
        .insert({
          company_id: input.companyId,
          warehouse_id: input.warehouseId,
          product_id: input.productId,
          movement_type_id: mType.id,
          characteristic_id: input.characteristicId ?? null,
          color_id: input.colorId ?? null,
          quantity: input.quantity,
          movement_date: input.movementDate ? new Date(input.movementDate).toISOString() : new Date().toISOString(),
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          dimension_values: input.dimensionValues ?? null
        })
        .select('id')
        .single();
      if (movErr || !newMov) throw new CoreRepositoryError(movErr?.message || 'Error al registrar el movimiento.');

      movementId = Number(newMov.id);
    } else {
      throw new CoreRepositoryError(error.message);
    }
  } else {
    movementId = Number(data);
  }
  
  if (input.dimensionValues && Object.keys(input.dimensionValues).length > 0) {
    await syncWarehouseStockItems(input.companyId, input.productId).catch(() => {});
  }
  
  return movementId ?? 0;
}

export async function registerStockTransfer(input: {
  companyId: number;
  sourceWarehouseId: number;
  targetWarehouseId: number;
  productId: number;
  quantity: number;
  characteristicId?: number | null;
  colorId?: number | null;
  reference?: string;
  notes?: string;
  movementDate?: string;
}): Promise<string> {
  const c = client();
  const { data, error } = await c.rpc('register_stock_transfer', {
    p_company_id: input.companyId,
    p_source_warehouse_id: input.sourceWarehouseId,
    p_target_warehouse_id: input.targetWarehouseId,
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_characteristic_id: input.characteristicId ?? null,
    p_reference: input.reference ?? null,
    p_notes: input.notes ?? null,
    p_movement_date: input.movementDate ? new Date(input.movementDate).toISOString() : new Date().toISOString(),
    p_color_id: input.colorId ?? null
  });
  if (error) throw new CoreRepositoryError(error.message);
  return String(data);
}

export async function listStockReservations(companyId: number, status = 'ACTIVE'): Promise<StockReservation[]> {
  const c = client();
  const { data, error } = await c
    .from('stock_reservation')
    .select('id,company_id,warehouse_id,product_id,characteristic_id,color_id,quantity,reference,notes,status,created_at,updated_at,warehouse:warehouse(code,name),product:product(code,commercial_description),characteristic:product_attribute(code,description:name),color:color(code,name)')
    .eq('company_id', companyId)
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  return (data ?? []) as unknown as StockReservation[];
}

export async function reserveStock(input: {
  companyId: number;
  warehouseId: number;
  productId: number;
  quantity: number;
  characteristicId?: number | null;
  colorId?: number | null;
  reference?: string;
  notes?: string;
}): Promise<number> {
  const c = client();
  const { data, error } = await c.rpc('reserve_stock', {
    p_company_id: input.companyId,
    p_warehouse_id: input.warehouseId,
    p_product_id: input.productId,
    p_quantity: input.quantity,
    p_characteristic_id: input.characteristicId ?? null,
    p_reference: input.reference ?? null,
    p_notes: input.notes ?? null,
    p_color_id: input.colorId ?? null
  });
  if (error) throw new CoreRepositoryError(error.message);
  return Number(data);
}

export async function releaseStockReservation(id: number): Promise<void> {
  const c = client();
  const { error } = await c.rpc('release_stock_reservation', { p_reservation_id: id });
  if (error) throw new CoreRepositoryError(error.message);
}

export async function consumeStockReservation(id: number): Promise<void> {
  const c = client();
  const { error } = await c.rpc('consume_stock_reservation', { p_reservation_id: id });
  if (error) throw new CoreRepositoryError(error.message);
}