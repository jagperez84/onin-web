-- OTD components can define how each physical dimension is calculated.
-- Expressions are stored by measurement-type dimension code and evaluated later by the OTD engine.
alter table public.otd_component
  add column if not exists component_type varchar(20) not null default 'BASIC',
  add column if not exists price_increment numeric(15,2) not null default 0,
  add column if not exists dimension_expressions jsonb not null default '{}'::jsonb;

update public.otd_component
set component_type = 'BASIC'
where component_type is null or component_type not in ('BASIC','IMPROVEMENT');

update public.otd_component
set price_increment = 0
where price_increment is null or price_increment < 0;

create index if not exists idx_otd_component_product_id on public.otd_component(product_id);
