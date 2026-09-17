-- Corrige measurement_opening: el "producto sugerido" de un hueco medido en
-- campo debe apuntar a un OTD (el configurador real de presupuestos, con sus
-- propias selecciones/dimensiones), no a una familia de artículo — la familia
-- alimenta el configurador "simple" genérico, que no es el que se usa para
-- toldos/pérgolas. Ver ROADMAP.md.

alter table public.measurement_opening
  add column if not exists otd_id bigint references public.otd(id);

alter table public.measurement_opening
  drop column if exists product_family_id;

alter table public.measurement_opening
  drop column if exists measurement_type_id;

comment on column public.measurement_opening.otd_id is
  'OTD sugerido por quien mide, in situ. Selección manual, no automática. Define qué selecciones/dimensiones aplican (otd_selection con is_dimension = true).';
