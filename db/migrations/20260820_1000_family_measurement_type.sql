-- Migration: Add measurement_type_id to product_family
alter table public.product_family
  add column if not exists measurement_type_id bigint references public.measurement_type(id);

create index if not exists idx_product_family_measurement_type on public.product_family(measurement_type_id);
