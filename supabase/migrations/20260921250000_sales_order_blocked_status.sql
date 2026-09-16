-- blockSalesOrder intentaba status='BLOCKED', pero ningún sales_order_status_ck lo ha admitido
-- nunca (revisado desde 20260824120000_sales_orders_from_quotations_v1.sql hasta
-- 20260913100000_sales_order_invoiced_status.sql) — ese update siempre fallaba y el código caía a
-- un fallback que solo etiquetaba `notes`, sin tocar `status` nunca. FabricationControl no podía
-- comprobar isOrderBlocked() de forma fiable contra el estado real.
--
-- blocked_from_status guarda el estado real del pedido justo antes de bloquearlo, para que
-- unblockSalesOrder pueda devolverlo exactamente ahí en vez de resetearlo siempre a
-- PENDING_MANUFACTURING (que hoy borraría el progreso real de un pedido ya en FABRICATING/
-- CONFECTIONED/MANUFACTURED si se desbloquea).
alter table public.sales_order add column if not exists blocked_from_status varchar(40);

alter table public.sales_order drop constraint if exists sales_order_status_ck;
alter table public.sales_order add constraint sales_order_status_ck
  check (status in ('PENDING_MANUFACTURING','PREPARED','FABRICATING','CONFECTIONED','MANUFACTURED','INSTALLATION_SCHEDULED','INSTALLED','INVOICED','CANCELLED','BLOCKED'));
