import { supabase } from '../../lib/supabase';
import { CoreRepositoryError, getCurrentCompanyId } from '../core/coreRepository';
import { updateMeasurement } from '../measurements/measurementRepository';
import { updateSalesOrderLocation } from '../sales/salesOrderService';

export type MapPointKind = 'medicion' | 'montaje';

export type MapPoint = {
  kind: MapPointKind;
  id: number;
  code: string;
  customerName: string | null;
  street: string | null;
  city: string | null;
  status: string;
  date: string | null;
  latitude: number | null;
  longitude: number | null;
  zoneId: number | null;
  // id used to persist geocoding/zone changes: measurement.id for mediciones,
  // sales_order.id for montajes (the installation itself has no address).
  locationOwnerId: number;
  linkTo: string;
};

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function listMeasurementPoints(cid: number): Promise<MapPoint[]> {
  const c = client();
  const { data, error } = await c
    .from('measurement')
    .select('id,company_id,code,customer_name_snapshot,site_street,site_city,site_latitude,site_longitude,zone_id,status,measurement_date')
    .eq('company_id', cid)
    .is('deleted_at', null)
    .neq('status', 'CANCELLED')
    .order('id', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  return (data || [])
    .filter((r: any) => Number(r.company_id) === cid)
    .map((r: any) => ({
      kind: 'medicion' as const,
      id: Number(r.id),
      code: r.code,
      customerName: r.customer_name_snapshot,
      street: r.site_street,
      city: r.site_city,
      status: r.status,
      date: r.measurement_date,
      latitude: r.site_latitude == null ? null : Number(r.site_latitude),
      longitude: r.site_longitude == null ? null : Number(r.site_longitude),
      zoneId: r.zone_id == null ? null : Number(r.zone_id),
      locationOwnerId: Number(r.id),
      linkTo: `/gestion/mediciones/${r.id}`,
    }));
}

async function listInstallationPoints(cid: number): Promise<MapPoint[]> {
  const c = client();
  const { data, error } = await c
    .from('installation')
    .select(
      'id,company_id,status,scheduled_date,sales_order:sales_order_id(id,company_id,code,installation_address_street,installation_address_city,installation_latitude,installation_longitude,zone_id,customer:customer_id(party:party_id(legal_name,trade_name)))'
    )
    .eq('company_id', cid)
    .neq('status', 'CANCELLED')
    .order('id', { ascending: false });
  if (error) throw new CoreRepositoryError(error.message);
  return (data || [])
    .filter((r: any) => Number(r.company_id) === cid)
    .map((r: any) => {
      const so = one(r.sales_order);
      const customer = one(so?.customer);
      const party = one(customer?.party);
      return {
        kind: 'montaje' as const,
        id: Number(r.id),
        code: so?.code || `#${r.sales_order_id}`,
        customerName: party?.trade_name || party?.legal_name || null,
        street: so?.installation_address_street ?? null,
        city: so?.installation_address_city ?? null,
        status: r.status,
        date: r.scheduled_date,
        latitude: so?.installation_latitude == null ? null : Number(so.installation_latitude),
        longitude: so?.installation_longitude == null ? null : Number(so.installation_longitude),
        zoneId: so?.zone_id == null ? null : Number(so.zone_id),
        locationOwnerId: Number(so?.id),
        linkTo: `/ventas/pedidos/${so?.id}`,
        _salesOrderCompanyId: so?.company_id == null ? null : Number(so.company_id),
      };
    })
    .filter((p: any) => p._salesOrderCompanyId === cid && Number.isFinite(p.locationOwnerId))
    .map(({ _salesOrderCompanyId: _ignored, ...p }: any) => p as MapPoint);
}

export async function listMapPoints(): Promise<MapPoint[]> {
  // The map must use the same active-company resolver as the rest of the
  // multi-tenant application. Do not derive the tenant independently here.
  const cid = await getCurrentCompanyId();
  const [measurements, installations] = await Promise.all([
    listMeasurementPoints(cid),
    listInstallationPoints(cid),
  ]);
  return [...measurements, ...installations];
}

export async function saveMapPointLocation(
  point: Pick<MapPoint, 'kind' | 'locationOwnerId'>,
  latitude: number | null,
  longitude: number | null,
  zoneId?: number | null
): Promise<void> {
  if (point.kind === 'medicion') {
    await updateMeasurement(point.locationOwnerId, { site_latitude: latitude, site_longitude: longitude, ...(zoneId !== undefined ? { zone_id: zoneId } : {}) });
  } else {
    await updateSalesOrderLocation(point.locationOwnerId, { installation_latitude: latitude, installation_longitude: longitude, ...(zoneId !== undefined ? { zone_id: zoneId } : {}) });
  }
}

export async function saveMapPointZone(point: Pick<MapPoint, 'kind' | 'locationOwnerId'>, zoneId: number | null): Promise<void> {
  if (point.kind === 'medicion') {
    await updateMeasurement(point.locationOwnerId, { zone_id: zoneId });
  } else {
    await updateSalesOrderLocation(point.locationOwnerId, { zone_id: zoneId });
  }
}
