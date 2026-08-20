import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from '../core/coreRepository';

export type StockItemAvailability = {
  productId: number;
  productCode: string;
  productName: string;
  characteristicId?: number | null;
  characteristicCode?: string | null;
  warehouseId: number | null;
  warehouseName: string;
  inStock: number;
  reserved: number;
  available: number;
  stockMinimum: number;
  requiredQuantity: number;
  hasSufficientStock: boolean;
  status: 'available' | 'low_stock' | 'out_of_stock' | 'untracked';
};

export type StockAvailabilityPreview = {
  mainProduct: StockItemAvailability;
  componentsStock: StockItemAvailability[];
  overallStatus: 'available' | 'low_stock' | 'out_of_stock' | 'untracked';
  warehouseName: string;
  checkedAt: string;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

export async function checkStockAvailability(input: {
  companyId: number;
  warehouseId?: number | null;
  productId: number;
  productCode: string;
  productName: string;
  stockEnabled: boolean;
  stockMinimum?: number;
  characteristicId?: number | null;
  characteristicCode?: string | null;
  quantity: number;
  components?: Array<{
    productId?: number | null;
    productCode?: string | null;
    productName?: string | null;
    characteristicId?: number | null;
    requiredQuantity: number;
  }>;
}): Promise<StockAvailabilityPreview> {
  const {
    companyId,
    warehouseId,
    productId,
    productCode,
    productName,
    stockEnabled,
    stockMinimum = 0,
    characteristicId,
    characteristicCode,
    quantity,
    components = [],
  } = input;

  if (!stockEnabled) {
    const untrackedItem: StockItemAvailability = {
      productId,
      productCode,
      productName,
      characteristicId,
      characteristicCode,
      warehouseId: warehouseId ?? null,
      warehouseName: 'Sin almacén',
      inStock: 0,
      reserved: 0,
      available: 0,
      stockMinimum: 0,
      requiredQuantity: quantity,
      hasSufficientStock: true,
      status: 'untracked',
    };

    return {
      mainProduct: untrackedItem,
      componentsStock: [],
      overallStatus: 'untracked',
      warehouseName: 'Sin control de stock',
      checkedAt: new Date().toISOString(),
    };
  }

  const c = client();

  // Find warehouse name
  let warehouseName = 'Almacén principal';
  if (warehouseId) {
    const { data: wData } = await c
      .from('warehouse')
      .select('name')
      .eq('id', warehouseId)
      .maybeSingle();
    if (wData?.name) warehouseName = wData.name;
  }

  // Collect all product IDs to query
  const allProductIds = [
    productId,
    ...components
      .map(comp => comp.productId)
      .filter((id): id is number => id != null),
  ];

  let query = c
    .from('warehouse_stock')
    .select('warehouse_id, product_id, characteristic_id, quantity, reserved_quantity, warehouse(id, name), product(id, code, commercial_description, stock_minimum)')
    .in('product_id', allProductIds);

  if (warehouseId) {
    query = query.eq('warehouse_id', warehouseId);
  }

  const { data: stockRows, error } = await query;
  if (error) throw new CoreRepositoryError(error.message);

  const balances = (stockRows ?? []) as any[];

  // 1. Evaluate Main Product
  const mainMatches = balances.filter(b => {
    if (b.product_id !== productId) return false;
    if (characteristicId != null && b.characteristic_id != null) {
      return b.characteristic_id === characteristicId;
    }
    return true;
  });

  const mainInStock = mainMatches.reduce((acc, row) => acc + Number(row.quantity ?? 0), 0);
  const mainReserved = mainMatches.reduce((acc, row) => acc + Number(row.reserved_quantity ?? 0), 0);
  const mainAvailable = Math.max(0, mainInStock - mainReserved);
  const mainSufficient = mainAvailable >= quantity;

  let mainStatus: StockItemAvailability['status'] = 'available';
  if (!mainSufficient) {
    mainStatus = mainAvailable > 0 ? 'low_stock' : 'out_of_stock';
  } else if (mainAvailable - quantity < stockMinimum) {
    mainStatus = 'low_stock';
  }

  const mainProductStock: StockItemAvailability = {
    productId,
    productCode,
    productName,
    characteristicId,
    characteristicCode,
    warehouseId: warehouseId ?? null,
    warehouseName,
    inStock: mainInStock,
    reserved: mainReserved,
    available: mainAvailable,
    stockMinimum,
    requiredQuantity: quantity,
    hasSufficientStock: mainSufficient,
    status: mainStatus,
  };

  // 2. Evaluate Components
  const componentsStock: StockItemAvailability[] = [];
  let anyCompOutOfStock = false;
  let anyCompLowStock = false;

  for (const comp of components) {
    if (!comp.productId) continue;

    const compMatches = balances.filter(b => {
      if (b.product_id !== comp.productId) return false;
      if (comp.characteristicId != null && b.characteristic_id != null) {
        return b.characteristic_id === comp.characteristicId;
      }
      return true;
    });

    const compInStock = compMatches.reduce((acc, row) => acc + Number(row.quantity ?? 0), 0);
    const compReserved = compMatches.reduce((acc, row) => acc + Number(row.reserved_quantity ?? 0), 0);
    const compAvailable = Math.max(0, compInStock - compReserved);
    const compSufficient = compAvailable >= comp.requiredQuantity;

    let compStatus: StockItemAvailability['status'] = 'available';
    if (!compSufficient) {
      compStatus = compAvailable > 0 ? 'low_stock' : 'out_of_stock';
      if (compAvailable === 0) anyCompOutOfStock = true;
      else anyCompLowStock = true;
    }

    componentsStock.push({
      productId: comp.productId,
      productCode: comp.productCode || `P-${comp.productId}`,
      productName: comp.productName || `Componente ${comp.productId}`,
      characteristicId: comp.characteristicId,
      warehouseId: warehouseId ?? null,
      warehouseName,
      inStock: compInStock,
      reserved: compReserved,
      available: compAvailable,
      stockMinimum: 0,
      requiredQuantity: comp.requiredQuantity,
      hasSufficientStock: compSufficient,
      status: compStatus,
    });
  }

  let overallStatus: StockAvailabilityPreview['overallStatus'] = mainStatus;
  if (anyCompOutOfStock || mainStatus === 'out_of_stock') {
    overallStatus = 'out_of_stock';
  } else if (anyCompLowStock || mainStatus === 'low_stock') {
    overallStatus = 'low_stock';
  }

  return {
    mainProduct: mainProductStock,
    componentsStock,
    overallStatus,
    warehouseName,
    checkedAt: new Date().toISOString(),
  };
}
