-- OTD: el escalado se resuelve contra los artículos reales de ONIN.
-- No se añaden datos duplicados de precios al OTD.
-- Las dimensiones y precios continúan perteneciendo al artículo maestro.

create index if not exists idx_product_scale_product_active_dimensions
  on public.product_scale(product_id, deleted_at, dimension_1, dimension_2);
