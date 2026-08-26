alter table public.stock_reservation
  add column if not exists warehouse_stock_item_id bigint null references public.warehouse_stock_item(id);

alter table public.stock_movement
  add column if not exists warehouse_stock_item_id bigint null references public.warehouse_stock_item(id);

create index if not exists idx_stock_reservation_stock_item
  on public.stock_reservation (warehouse_stock_item_id);

create index if not exists idx_stock_movement_stock_item
  on public.stock_movement (warehouse_stock_item_id);

comment on column public.stock_reservation.warehouse_stock_item_id is
  'Existencia física reservada cuando el artículo utiliza control dimensional.';
comment on column public.stock_movement.warehouse_stock_item_id is
  'Existencia física afectada por el movimiento; permite trazar consumos y remanentes.';
