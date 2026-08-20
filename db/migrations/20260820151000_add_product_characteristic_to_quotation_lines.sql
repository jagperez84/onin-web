-- La característica seleccionada en una línea identifica la variante comercial del artículo.
-- Se mantiene el modelo antiguo de atributos para compatibilidad con presupuestos existentes.
alter table public.quotation_line_characteristic
  add column if not exists product_characteristic_id bigint null references public.product_characteristic(id);

create index if not exists idx_quotation_line_characteristic_product_characteristic
  on public.quotation_line_characteristic (product_characteristic_id);

comment on column public.quotation_line_characteristic.product_characteristic_id is
  'Característica/variante comercial concreta del artículo seleccionada en la línea del presupuesto.';
