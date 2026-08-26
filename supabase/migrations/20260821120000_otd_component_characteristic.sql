-- OTD components may optionally pin a concrete product characteristic (for example a colour/variant).
-- Nullable because many ONIN articles do not have characteristics.
alter table public.otd_component
  add column if not exists characteristic_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'otd_component_characteristic_id_fkey'
      and conrelid = 'public.otd_component'::regclass
  ) then
    alter table public.otd_component
      add constraint otd_component_characteristic_id_fkey
      foreign key (characteristic_id) references public.product_characteristic(id);
  end if;
end $$;

create index if not exists idx_otd_component_characteristic_id
  on public.otd_component(characteristic_id);
