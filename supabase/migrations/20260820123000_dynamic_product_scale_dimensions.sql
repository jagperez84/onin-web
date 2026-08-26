-- Escalado dinámico: las dimensiones del escalón siguen las dimensiones del Tipo de medida.
alter table public.product_scale
  add column if not exists dimension_values jsonb;

update public.product_scale
set dimension_values =
  jsonb_build_array(dimension_1) ||
  case when dimension_2 is null then '[]'::jsonb else jsonb_build_array(dimension_2) end
where dimension_values is null;

alter table public.product_scale
  alter column dimension_values set default '[]'::jsonb;

comment on column public.product_scale.dimension_values is
  'Valores dimensionales del escalón, en el mismo orden que measurement_type_dimension.dimension_number.';
