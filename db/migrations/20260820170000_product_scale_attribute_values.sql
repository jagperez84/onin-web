-- Los escalados guardan la configuración de características del artículo.
-- Se mantiene characteristic_id por compatibilidad con el modelo anterior.
alter table public.product_scale
  add column if not exists attribute_values jsonb not null default '{}'::jsonb;

comment on column public.product_scale.attribute_values is
  'Valores de las características del artículo usadas por el escalado, indexados por attribute_id.';
