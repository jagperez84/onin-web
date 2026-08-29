-- ONIN: nuevo estado de pedido "INSTALLATION_SCHEDULED" (Montaje programado).
--
-- Hasta ahora, programar un montaje no dejaba ningún rastro en el estado del
-- pedido: seguía marcado como MANUFACTURED tanto si no había ningún montaje
-- generado como si ya había uno programado y pendiente de realizar. Se añade
-- un estado intermedio entre MANUFACTURED e INSTALLED que sí lo refleja:
-- MANUFACTURED -> (se programa el montaje) -> INSTALLATION_SCHEDULED ->
-- (se completa el montaje) -> INSTALLED. Si el montaje programado se cancela,
-- el pedido vuelve a MANUFACTURED.

alter table public.sales_order drop constraint if exists sales_order_status_ck;
alter table public.sales_order add constraint sales_order_status_ck
  check (status in ('PENDING_MANUFACTURING','PREPARED','FABRICATING','CONFECTIONED','MANUFACTURED','INSTALLATION_SCHEDULED','INSTALLED','CANCELLED'));

create or replace function public.sync_sales_order_installation_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'SCHEDULED' then
      update public.sales_order
         set status = 'INSTALLATION_SCHEDULED', updated_at = now()
       where id = new.sales_order_id and status = 'MANUFACTURED';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'CANCELLED' and old.status = 'SCHEDULED' then
      update public.sales_order
         set status = 'MANUFACTURED', updated_at = now()
       where id = new.sales_order_id and status = 'INSTALLATION_SCHEDULED';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_sales_order_installation_status on public.installation;
create trigger trg_sync_sales_order_installation_status
after insert or update on public.installation
for each row execute function public.sync_sales_order_installation_status();

-- mark_sales_order_manufactured() ya no debe poder retroceder un pedido que ya
-- tiene un montaje programado de vuelta a MANUFACTURED.
create or replace function public.mark_sales_order_manufactured(p_sales_order_id bigint)
returns void
language plpgsql
security invoker
as $$
begin
  update public.sales_order
     set status = 'MANUFACTURED', updated_at = now()
   where id = p_sales_order_id
     and status not in ('MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED', 'CANCELLED');
end;
$$;
