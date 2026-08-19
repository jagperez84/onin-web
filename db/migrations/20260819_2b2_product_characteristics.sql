-- 2B.2: endurece el modelo de características propias del artículo.
-- Una característica identifica una variante del artículo y puede participar
-- en precio, stock y escalado. No se mezcla con product_attribute, que es el
-- catálogo de atributos utilizado por las líneas de presupuesto.

create unique index if not exists uq_product_characteristic_product_code
  on public.product_characteristic(product_id, code);

create index if not exists ix_product_characteristic_product_active
  on public.product_characteristic(product_id, active)
  where deleted_at is null;

alter table public.product_characteristic
  drop constraint if exists product_characteristic_stock_minimum_ck;

alter table public.product_characteristic
  add constraint product_characteristic_stock_minimum_ck
  check (stock_minimum >= 0);

comment on table public.product_characteristic is
  'Variantes propias de un artículo. Puede contener valores comerciales y de stock independientes; no sustituye al catálogo product_attribute.';
