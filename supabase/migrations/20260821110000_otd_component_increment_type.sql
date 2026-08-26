alter table public.otd_component
  add column if not exists price_increment_type text not null default 'FIXED';

alter table public.otd_component
  drop constraint if exists otd_component_price_increment_type_check;

alter table public.otd_component
  add constraint otd_component_price_increment_type_check
  check (price_increment_type in ('FIXED','PERCENTAGE'));
