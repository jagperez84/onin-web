import { supabase } from '../../lib/supabase';
import { CoreRepositoryError } from './coreRepository';

export type BusinessDashboardMetrics = {
  ordersInProgress: number;
  ordersInProgressAmount: number;
  ordersDueSoon: number;
  installationsScheduled: number;
  lowStockCount: number;
};

function client() { if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.'); return supabase; }

async function companyId(): Promise<number> {
  const c = client();
  const { data: { user }, error: ue } = await c.auth.getUser();
  if (ue || !user) throw new CoreRepositoryError('No hay un usuario autenticado.');
  const { data, error } = await c.from('user_account').select('company_id').eq('auth_user_id', user.id).maybeSingle();
  if (error) throw new CoreRepositoryError(error.message);
  if (data?.company_id == null) throw new CoreRepositoryError('El usuario no tiene empresa asignada.');
  return Number(data.company_id);
}

const OPEN_ORDER_STATUSES = ['PENDING_MANUFACTURING', 'PREPARED', 'FABRICATING', 'CONFECTIONED', 'MANUFACTURED', 'INSTALLATION_SCHEDULED'];

export async function getBusinessDashboardMetrics(): Promise<BusinessDashboardMetrics> {
  const c = client();
  const cid = await companyId();

  const dueSoonDate = new Date();
  dueSoonDate.setDate(dueSoonDate.getDate() + 7);
  const dueSoonIso = dueSoonDate.toISOString().slice(0, 10);

  const [openOrders, dueSoon, installations, warehouses] = await Promise.all([
    c.from('sales_order').select('total_amount').eq('company_id', cid).in('status', OPEN_ORDER_STATUSES),
    c.from('sales_order').select('id', { count: 'exact', head: true }).eq('company_id', cid).in('status', OPEN_ORDER_STATUSES).not('requested_delivery_date', 'is', null).lte('requested_delivery_date', dueSoonIso),
    c.from('installation').select('id', { count: 'exact', head: true }).eq('company_id', cid).eq('status', 'SCHEDULED'),
    c.from('warehouse').select('id').eq('company_id', cid).is('deleted_at', null),
  ]);
  for (const result of [openOrders, dueSoon, installations, warehouses]) if (result.error) throw new CoreRepositoryError(result.error.message);

  const warehouseIds = (warehouses.data ?? []).map((w: { id: number }) => w.id);
  let lowStockCount = 0;
  if (warehouseIds.length) {
    const { data, error } = await c.from('warehouse_stock').select('quantity,product:product(stock_minimum)').in('warehouse_id', warehouseIds);
    if (error) throw new CoreRepositoryError(error.message);
    lowStockCount = (data ?? []).filter((row: any) => {
      const minimum = Number(row.product?.stock_minimum || 0);
      return minimum > 0 && Number(row.quantity || 0) < minimum;
    }).length;
  }

  return {
    ordersInProgress: (openOrders.data ?? []).length,
    ordersInProgressAmount: (openOrders.data ?? []).reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
    ordersDueSoon: Number(dueSoon.count ?? 0),
    installationsScheduled: Number(installations.count ?? 0),
    lowStockCount,
  };
}
