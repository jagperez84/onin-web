-- Corrige una regresión: 20260918100000_profile_cut_color.sql (al añadir
-- color a execute_manual_dimensional_cut_with_work_sheet) redefinió la
-- función recorriendo p_selections directamente, en vez de los
-- stock_reservation_item realmente asignados — y al hacerlo se perdió sin
-- querer todo el bloque de enlace de trazabilidad que ya se había arreglado
-- en 20260914090000_fix_dimensional_cut_traceability.sql: el remanente
-- generado por un corte de perfil dejó de enlazarse con el pedido/línea/hoja
-- de corte que lo originó (source_sales_order_id/source_sales_order_line_id/
-- source_work_sheet_id/source_work_sheet_line_id/remnant_generated_at
-- quedaban NULL), y los movimientos de alta/consumo dejaron de rellenar su
-- columna de dimensiones.
--
-- Esta migración recupera esa lógica (recorrer stock_reservation_item vía
-- v_reservation_id, enlazar el remanente por parent_stock_item_id, rellenar
-- dimension_values en los dos movimientos generados) manteniendo el soporte
-- de color añadido después. De paso, la comparación por characteristic_id
-- que localiza el movimiento de consumo a rellenar ahora también exige
-- color_id, para no confundir dos colores del mismo artículo/característica
-- ejecutados en paralelo.

create or replace function public.execute_manual_dimensional_cut_with_work_sheet(
  p_company_id bigint,
  p_sales_order_id bigint,
  p_sales_order_line_id bigint,
  p_sales_order_line_no integer,
  p_product_id bigint,
  p_product_code varchar,
  p_product_name text,
  p_characteristic_id bigint,
  p_characteristic_code varchar,
  p_characteristic_name text,
  p_required_dimension_values jsonb,
  p_quantity numeric,
  p_selections jsonb,
  p_reference text default null,
  p_notes text default null,
  p_color_id bigint default null,
  p_color_code varchar default null,
  p_color_name text default null
)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_reservation_id bigint;
  v_work_sheet_id bigint;
  v_code varchar;
  v_item record;
  v_line_no integer := 1;
  v_total numeric := 0;
  v_started_at timestamptz := clock_timestamp();
  v_required_length numeric;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad de la hoja de corte debe ser mayor que cero';
  end if;
  if p_required_dimension_values is null or jsonb_typeof(p_required_dimension_values) <> 'array' or jsonb_array_length(p_required_dimension_values) <> 1 then
    raise exception 'La hoja de corte de perfil requiere actualmente una única dimensión de longitud';
  end if;
  v_required_length := (p_required_dimension_values->>0)::numeric;
  if v_required_length <= 0 then
    raise exception 'La longitud de corte debe ser mayor que cero';
  end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then
    raise exception 'La hoja de corte debe contener al menos una pieza seleccionada';
  end if;

  -- El corte y la creación del documento están dentro de la misma transacción.
  -- Si cualquiera de los dos falla, no queda ni consumo de stock ni documento.
  v_reservation_id := public.execute_manual_dimensional_cut(
    p_company_id,
    p_product_id,
    p_characteristic_id,
    p_required_dimension_values,
    p_selections,
    p_reference,
    p_notes,
    p_color_id
  );

  v_code := public.generate_production_work_sheet_code(p_company_id);

  insert into public.production_work_sheet (
    company_id, code, document_type, issue_date, status,
    sales_order_id, sales_order_line_id, sales_order_line_no,
    product_id, product_code, product_name,
    characteristic_id, characteristic_code, characteristic_name,
    color_id, color_code, color_name,
    required_length, quantity, reference, notes
  ) values (
    p_company_id, v_code, 'PROFILE_CUT', now(), 'ISSUED',
    p_sales_order_id, p_sales_order_line_id, p_sales_order_line_no,
    p_product_id, p_product_code, p_product_name,
    p_characteristic_id, p_characteristic_code, p_characteristic_name,
    p_color_id, p_color_code, p_color_name,
    v_required_length, p_quantity, p_reference, p_notes
  ) returning id into v_work_sheet_id;

  for v_item in
    select sri.id reservation_item_id, sri.stock_item_id, sri.allocated_quantity, sri.requested_dimension_values, sri.remaining_dimension_values,
           wsi.dimension_values source_dimension_values, ws.warehouse_id, w.code warehouse_code, w.name warehouse_name
    from public.stock_reservation_item sri
    join public.warehouse_stock_item wsi on wsi.id = sri.stock_item_id
    join public.warehouse_stock ws on ws.id = wsi.warehouse_stock_id
    join public.warehouse w on w.id = ws.warehouse_id
    where sri.reservation_id = v_reservation_id
    order by sri.id
  loop
    v_total := v_total + v_item.allocated_quantity;

    insert into public.production_work_sheet_line (
      work_sheet_id, line_no, warehouse_id, warehouse_code, warehouse_name,
      stock_item_id, source_dimension_values, cut_dimension_values,
      quantity, remainder_dimension_values, selected_snapshot
    ) values (
      v_work_sheet_id, v_line_no, v_item.warehouse_id, v_item.warehouse_code, v_item.warehouse_name,
      v_item.stock_item_id, v_item.source_dimension_values, v_item.requested_dimension_values,
      v_item.allocated_quantity, v_item.remaining_dimension_values,
      jsonb_build_object(
        'reservation_id', v_reservation_id,
        'reservation_item_id', v_item.reservation_item_id,
        'stock_item_id', v_item.stock_item_id,
        'warehouse_id', v_item.warehouse_id,
        'warehouse_code', v_item.warehouse_code,
        'warehouse_name', v_item.warehouse_name,
        'source_dimension_values', v_item.source_dimension_values,
        'cut_dimension_values', v_item.requested_dimension_values,
        'quantity', v_item.allocated_quantity,
        'remainder_dimension_values', v_item.remaining_dimension_values
      )
    );

    -- Enlaza el remanente (si lo hay) con el pedido/línea/hoja de corte que lo generó.
    -- parent_stock_item_id identifica de forma única a ese remanente: una pieza física
    -- consumida una vez no puede volver a generar otro.
    update public.warehouse_stock_item
    set remnant_generated_at = coalesce(remnant_generated_at, created_at),
        source_sales_order_id = p_sales_order_id,
        source_sales_order_line_id = p_sales_order_line_id,
        source_work_sheet_id = v_work_sheet_id,
        source_work_sheet_line_id = (select id from public.production_work_sheet_line where work_sheet_id = v_work_sheet_id and line_no = v_line_no),
        updated_at = now()
    where parent_stock_item_id = v_item.stock_item_id;

    -- Rellena la dimensión del movimiento de alta del remanente (enlace exacto vía
    -- source_stock_movement_id, que ya apunta al movimiento que dio de alta esa pieza).
    if v_item.remaining_dimension_values is not null and jsonb_array_length(v_item.remaining_dimension_values) > 0 then
      update public.stock_movement sm
         set dimension_values = v_item.remaining_dimension_values
        from public.warehouse_stock_item remnant
       where remnant.parent_stock_item_id = v_item.stock_item_id
         and remnant.source_stock_movement_id = sm.id
         and (sm.dimension_values is null or jsonb_array_length(sm.dimension_values) = 0);
    end if;

    -- Rellena la dimensión del movimiento de consumo de esta misma pieza. No hay un
    -- enlace directo (solo la pieza que se crea guarda su movimiento de alta, no la que
    -- se consume), así que se toma el más antiguo de esta ejecución que aún esté sin
    -- rellenar — funciona porque los movimientos de consumo se generan en el mismo orden
    -- que estas líneas. Se exige también color_id para no confundir dos colores del mismo
    -- artículo/característica ejecutados en paralelo.
    if v_item.requested_dimension_values is not null and jsonb_array_length(v_item.requested_dimension_values) > 0 then
      update public.stock_movement
         set dimension_values = v_item.requested_dimension_values
       where id = (
         select sm2.id
           from public.stock_movement sm2
           join public.stock_movement_type smt on smt.id = sm2.movement_type_id
          where smt.code = 'DIMENSIONAL_CONSUMPTION'
            and smt.company_id = p_company_id
            and sm2.product_id = p_product_id
            and sm2.characteristic_id is not distinct from p_characteristic_id
            and sm2.color_id is not distinct from p_color_id
            and sm2.warehouse_id = v_item.warehouse_id
            and sm2.quantity = v_item.allocated_quantity
            and sm2.movement_date >= v_started_at
            and (sm2.dimension_values is null or jsonb_array_length(sm2.dimension_values) = 0)
          order by sm2.id asc
          limit 1
       );
    end if;

    v_line_no := v_line_no + 1;
  end loop;

  if v_total <> p_quantity then
    raise exception 'La hoja de corte no coincide con la cantidad ejecutada: % de %', v_total, p_quantity;
  end if;

  return v_work_sheet_id;
end;
$$;

grant execute on function public.execute_manual_dimensional_cut_with_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,numeric,jsonb,text,text,bigint,varchar,text) to authenticated;
