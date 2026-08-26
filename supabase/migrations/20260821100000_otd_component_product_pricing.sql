-- OTD components reference real ONIN products.
-- Idempotent so it is safe against environments where these columns already exist.

alter table public.otd_component
  add column if not exists product_id bigint,
  add column if not exists component_type varchar(20) not null default 'BASIC',
  add column if not exists price_increment numeric(15,2) not null default 0;

update public.otd_component
set component_type = 'BASIC'
where component_type is null or component_type not in ('BASIC','IMPROVEMENT');

update public.otd_component
set price_increment = 0
where price_increment is null or price_increment < 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'otd_component_product_id_fkey'
      and conrelid = 'public.otd_component'::regclass
  ) then
    alter table public.otd_component
      add constraint otd_component_product_id_fkey
      foreign key (product_id) references public.product(id);
  end if;
end $$;

create index if not exists idx_otd_component_product_id
  on public.otd_component(product_id);
