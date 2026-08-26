-- Production work has started as soon as a profile-cut or lona-confection sheet
-- is created for a sales-order line. Keep the order status aligned with that state.

alter table public.sales_order drop constraint if exists sales_order_status_ck;
alter table public.sales_order add constraint sales_order_status_ck
  check (status in ('PENDING_MANUFACTURING','PREPARED','FABRICATING','CONFECTIONED','MANUFACTURED','INSTALLED','CANCELLED'));

create or replace function public.sync_sales_order_fabricating_from_work_sheet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sales_order_id is not null
     and new.document_type in ('PROFILE_CUT','LONA_CONFECTION')
     and new.status <> 'CANCELLED' then
    update public.sales_order
       set status = case
         when status in ('PENDING_MANUFACTURING','PREPARED') then 'FABRICATING'
         else status
       end,
       updated_at = now()
     where id = new.sales_order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_sales_order_fabricating_from_work_sheet on public.production_work_sheet;
create trigger trg_sync_sales_order_fabricating_from_work_sheet
after insert on public.production_work_sheet
for each row execute function public.sync_sales_order_fabricating_from_work_sheet();

grant execute on function public.sync_sales_order_fabricating_from_work_sheet() to authenticated;
