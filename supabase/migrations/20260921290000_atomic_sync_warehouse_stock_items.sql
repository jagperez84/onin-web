-- syncWarehouseStockItems (src/services/warehouse/stockRepository.ts) reconciliaba
-- warehouse_stock_item leyendo stock_movement/warehouse_stock/warehouse_stock_item en
-- 3 consultas separadas desde el cliente y luego insertando la diferencia: si dos
-- llamadas concurrentes reconcilian el mismo producto (p.ej. dos cortes manuales a la
-- vez del mismo perfil, cada uno llama a esta función antes de cortar), ambas leen la
-- misma foto de "huecos" antes de que ninguna inserte, y las dos insertan la misma
-- cantidad de piezas -> stock dimensional duplicado que no existe físicamente.
--
-- Se mueve la misma lógica (idéntico agrupado por almacén/característica/color/longitud
-- y mismo criterio de "huecos" = cantidad esperada - items activos existentes) a una
-- función atómica, serializada con un advisory lock por producto para que la segunda
-- llamada concurrente vea ya reflejados los inserts de la primera antes de calcular su
-- propio hueco.
create or replace function public.sync_warehouse_stock_items(p_company_id bigint, p_product_id bigint)
returns void
language plpgsql
security invoker
as $$
declare
  v_group record;
  v_existing_count integer;
  v_diff integer;
  v_ws_id bigint;
begin
  perform pg_advisory_xact_lock(45501, p_product_id::int);

  for v_group in
    select
      m.warehouse_id,
      m.characteristic_id,
      m.color_id,
      (m.dimension_values->>0)::numeric as length,
      sum(mt.direction * m.quantity) as qty,
      min(m.id) as source_movement_id
    from public.stock_movement m
    join public.stock_movement_type mt on mt.id = m.movement_type_id
    where m.company_id = p_company_id
      and m.product_id = p_product_id
      and jsonb_typeof(m.dimension_values) = 'array'
      and jsonb_array_length(m.dimension_values) > 0
      and (m.dimension_values->>0)::numeric > 0
    group by m.warehouse_id, m.characteristic_id, m.color_id, (m.dimension_values->>0)::numeric
    having sum(mt.direction * m.quantity) > 0
  loop
    select count(*) into v_existing_count
    from public.warehouse_stock_item wsi
    where wsi.product_id = p_product_id
      and wsi.characteristic_id is not distinct from v_group.characteristic_id
      and wsi.color_id is not distinct from v_group.color_id
      and wsi.status in ('AVAILABLE','RESERVED')
      and (wsi.dimension_values->>0)::numeric = v_group.length;

    v_diff := v_group.qty - v_existing_count;
    if v_diff > 0 then
      select id into v_ws_id
      from public.warehouse_stock
      where warehouse_id = v_group.warehouse_id
        and product_id = p_product_id
        and characteristic_id is not distinct from v_group.characteristic_id
        and color_id is not distinct from v_group.color_id
      for update;

      if v_ws_id is null then
        insert into public.warehouse_stock(warehouse_id, product_id, characteristic_id, color_id, quantity, reserved_quantity)
        values (v_group.warehouse_id, p_product_id, v_group.characteristic_id, v_group.color_id, v_group.qty, 0)
        returning id into v_ws_id;
      end if;

      insert into public.warehouse_stock_item(warehouse_stock_id, product_id, characteristic_id, color_id, quantity, dimension_values, status, source_stock_movement_id)
      select v_ws_id, p_product_id, v_group.characteristic_id, v_group.color_id, 1, jsonb_build_array(v_group.length), 'AVAILABLE', v_group.source_movement_id
      from generate_series(1, v_diff);
    end if;
  end loop;
end;
$$;
revoke all on function public.sync_warehouse_stock_items(bigint,bigint) from public;
grant execute on function public.sync_warehouse_stock_items(bigint,bigint) to authenticated;
