import { supabase } from '../../lib/supabase';
import { CoreRepositoryError, getUserDisplayNames } from '../core/coreRepository';

function client() {
  if (!supabase) throw new CoreRepositoryError('Supabase no está configurado.');
  return supabase;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function partyName(value: any): string {
  const party = one(value);
  return party?.trade_name || party?.legal_name || 'Sin nombre';
}

export const AUDIT_TABLES = [
  'quotation',
  'sales_order',
  'invoice',
  'invoice_installment',
  'production_work_sheet',
  'delivery_note',
  'installation',
  'customer',
  'user_account',
  'user_module_permission',
] as const;
export type AuditTable = (typeof AUDIT_TABLES)[number];

export const AUDIT_TABLE_LABELS: Record<AuditTable, string> = {
  quotation: 'Presupuesto',
  sales_order: 'Pedido',
  invoice: 'Factura',
  invoice_installment: 'Cobro',
  production_work_sheet: 'Hoja de trabajo',
  delivery_note: 'Albarán',
  installation: 'Montaje',
  customer: 'Cliente',
  user_account: 'Usuario',
  user_module_permission: 'Permiso',
};

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  INSERT: 'Alta',
  UPDATE: 'Modificación',
  DELETE: 'Baja',
};

export type AuditLogRow = {
  id: number;
  tableName: string;
  tableLabel: string;
  recordId: number | null;
  action: AuditAction;
  changedBy: string | null;
  userName: string;
  changedAt: string;
  changedFields: string[] | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  recordLabel: string;
};

export type AuditLogFilters = {
  table?: AuditTable | 'ALL';
  action?: AuditAction | 'ALL';
  userId?: string | null;
  from: string;
  to: string;
};

export type AuditLogPage = { rows: AuditLogRow[]; total: number };

const PAGE_SIZE = 50;

function inlineLabel(tableName: string, data: Record<string, any> | null): string | null {
  if (!data) return null;
  switch (tableName) {
    case 'quotation':
    case 'sales_order':
    case 'invoice':
    case 'production_work_sheet':
    case 'delivery_note':
      return data.code ?? null;
    case 'user_account':
      return data.display_name || data.username || data.email || null;
    default:
      return null;
  }
}

/** Tablas cuya etiqueta legible requiere una consulta aparte (join a otra tabla). */
async function resolveJoinedLabels(
  pending: { tableName: string; recordId: number }[],
): Promise<Map<string, string>> {
  const c = client();
  const labels = new Map<string, string>();
  const idsByTable = new Map<string, number[]>();
  for (const p of pending) {
    const list = idsByTable.get(p.tableName) ?? [];
    list.push(p.recordId);
    idsByTable.set(p.tableName, list);
  }

  const tasks: PromiseLike<void>[] = [];

  const installationIds = idsByTable.get('installation');
  if (installationIds?.length) {
    tasks.push(
      c
        .from('installation')
        .select('id,sales_order:sales_order_id(code)')
        .in('id', installationIds)
        .then(({ data }) => {
          for (const row of (data ?? []) as any[]) {
            const so = one(row.sales_order);
            labels.set(`installation:${row.id}`, so?.code ? `Pedido ${so.code}` : `#${row.id}`);
          }
        }),
    );
  }

  const customerIds = idsByTable.get('customer');
  if (customerIds?.length) {
    tasks.push(
      c
        .from('customer')
        .select('id,party:party_id(legal_name,trade_name)')
        .in('id', customerIds)
        .then(({ data }) => {
          for (const row of (data ?? []) as any[]) labels.set(`customer:${row.id}`, partyName(row.party));
        }),
    );
  }

  const installmentIds = idsByTable.get('invoice_installment');
  if (installmentIds?.length) {
    tasks.push(
      c
        .from('invoice_installment')
        .select('id,sequence,invoice:invoice_id(code)')
        .in('id', installmentIds)
        .then(({ data }) => {
          for (const row of (data ?? []) as any[]) {
            const inv = one(row.invoice);
            labels.set(`invoice_installment:${row.id}`, inv?.code ? `${inv.code} · plazo ${row.sequence}` : `Plazo #${row.id}`);
          }
        }),
    );
  }

  const permissionIds = idsByTable.get('user_module_permission');
  if (permissionIds?.length) {
    tasks.push(
      c
        .from('user_module_permission')
        .select('id,route_key,user_account:user_account_id(display_name,username)')
        .in('id', permissionIds)
        .then(({ data }) => {
          for (const row of (data ?? []) as any[]) {
            const u = one(row.user_account);
            labels.set(`user_module_permission:${row.id}`, `${u?.display_name || u?.username || 'Usuario'} · ${row.route_key}`);
          }
        }),
    );
  }

  await Promise.all(tasks);
  return labels;
}

export async function listAuditLog(filters: AuditLogFilters, page: number): Promise<AuditLogPage> {
  const c = client();
  let q = c
    .from('audit_log')
    .select('id,table_name,record_id,action,changed_by,changed_at,changed_fields,old_data,new_data', { count: 'exact' })
    .gte('changed_at', `${filters.from}T00:00:00`)
    .lte('changed_at', `${filters.to}T23:59:59`)
    .order('changed_at', { ascending: false });
  if (filters.table && filters.table !== 'ALL') q = q.eq('table_name', filters.table);
  if (filters.action && filters.action !== 'ALL') q = q.eq('action', filters.action);
  if (filters.userId) q = q.eq('changed_by', filters.userId);
  q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  const { data, error, count } = await q;
  if (error) throw new CoreRepositoryError(error.message);

  const rows = (data ?? []).map((r: any) => ({
    id: Number(r.id),
    tableName: r.table_name as string,
    recordId: r.record_id == null ? null : Number(r.record_id),
    action: r.action as AuditAction,
    changedBy: r.changed_by as string | null,
    changedAt: r.changed_at as string,
    changedFields: r.changed_fields as string[] | null,
    oldData: r.old_data as Record<string, unknown> | null,
    newData: r.new_data as Record<string, unknown> | null,
  }));

  const needsJoinLookup = rows.filter(
    (r) => r.recordId != null && inlineLabel(r.tableName, (r.newData ?? r.oldData) as any) == null,
  );

  const [userNames, joinedLabels] = await Promise.all([
    getUserDisplayNames(rows.map((r) => r.changedBy)),
    resolveJoinedLabels(needsJoinLookup.map((r) => ({ tableName: r.tableName, recordId: r.recordId! }))),
  ]);

  return {
    total: count ?? rows.length,
    rows: rows.map((r) => {
      const inline = inlineLabel(r.tableName, (r.newData ?? r.oldData) as any);
      const joined = r.recordId != null ? joinedLabels.get(`${r.tableName}:${r.recordId}`) : undefined;
      return {
        ...r,
        tableLabel: AUDIT_TABLE_LABELS[r.tableName as AuditTable] ?? r.tableName,
        userName: r.changedBy ? userNames[r.changedBy] || 'Usuario eliminado' : 'Sistema',
        recordLabel: inline || joined || (r.recordId != null ? `#${r.recordId}` : '—'),
      };
    }),
  };
}
