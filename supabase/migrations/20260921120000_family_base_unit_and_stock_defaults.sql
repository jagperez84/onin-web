-- La familia gana Unidad base y los mismos interruptores de gestión de stock que
-- ya tiene el artículo (Actualizar stock, Stock mínimo, Permitir stock negativo,
-- Incluir medidas en stock, Incluir stock por color, Escalado, Escalado por
-- característica, Corte liso). No se convierten en una resolución dinámica tipo
-- "artículo ?? familia" — todos estos flags tienen efecto real leyendo
-- directamente product.* en precio/stock/corte (ver auditoría de esta sesión), y
-- cambiar eso sería un rediseño mayor no pedido. En su lugar, la familia actúa
-- como plantilla: al elegir familia en un artículo nuevo se copian estos valores
-- a sus propias columnas (ver ProductV2.tsx), que el artículo conserva y puede
-- seguir ajustando de forma independiente a partir de ahí — igual que ya ocurre
-- con Tipo de producto.
alter table public.product_family add column if not exists base_unit_id bigint references public.unit(id);
alter table public.product_family add column if not exists stock_enabled boolean not null default false;
alter table public.product_family add column if not exists stock_minimum numeric not null default 0;
alter table public.product_family add column if not exists allow_negative_stock boolean not null default false;
alter table public.product_family add column if not exists include_measurements_in_stock boolean not null default false;
alter table public.product_family add column if not exists include_stock_by_color boolean not null default false;
alter table public.product_family add column if not exists scaled boolean not null default false;
alter table public.product_family add column if not exists scaled_by_characteristic boolean not null default false;
alter table public.product_family add column if not exists smooth_cut boolean not null default false;
