-- La hoja de corte debe conservar las piezas físicas exactas que fueron seleccionadas.
-- El corte manual devuelve la reserva consumida, cuyos stock_reservation_item
-- mantienen el vínculo con warehouse_stock_item incluso después del consumo.

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
  p_notes text default null
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
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad de la hoja de corte debe ser mayor que cero';
  end if;
  if p_required_dimension_values is null or jsonb_typeof(p_required_dimension_values) <> 'array' or jsonb_array_length(p_required_dimension_values) <> 1 then
    raise exception 'La hoja de corte de perfil requiere una única dimensión de longitud';
  end if;
  if (p_required_dimension_values->>0)::numeric <= 0 then
    raise exception 'La longitud de corte debe ser mayor que cero';
  end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then
    raise exception 'La hoja de corte debe contener al menos una pieza seleccionada';
  end if;

  -- Stock y documento se generan en la misma transacción.
  v_reservation_id := public.execute_manual_dimensional_cut(
    p_company_id,
    p_product_id,
    p_characteristic_id,
    p_required_dimension_values,
    p_selections,
    p_reference,
    p_notes
  );

  v_code := public.generate_production_work_sheet_code(p_company_id);

  insert into public.production_work_sheet (
    company_id, code, document_type, issue_date, status,
    sales_order_id, sales_order_line_id, sales_order_line_no,
    product_id, product_code, product_name,
    characteristic_id, characteristic_code, characteristic_name,
    required_length, quantity, reference, notes
  ) values (
    p_company_id, v_code, 'PROFILE_CUT', now(), 'ISSUED',
    p_sales_order_id, p_sales_order_line_id, p_sales_order_line_no,
    p_product_id, p_product_code, p_product_name,
    p_characteristic_id, p_characteristic_code, p_characteristic_name,
    (p_required_dimension_values->>0)::numeric, p_quantity, p_reference, p_notes
  ) returning id into v_work_sheet_id;

  -- Recuperamos las piezas físicas reales seleccionadas por el motor de corte,
  -- no solo la selección agregada enviada desde la interfaz.
  for v_item in
    select
      sri.id as reservation_item_id,
      sri.stock_item_id,
      sri.allocated_quantity,
      sri.requested_dimension_values,
      sri.remaining_dimension_values,
      wsi.dimension_values as source_dimension_values,
      ws.warehouse_id,
      w.code as warehouse_code,
      w.name as warehouse_name
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
      v_work_sheet_id,
      v_line_no,
      v_item.warehouse_id,
      v_item.warehouse_code,
      v_item.warehouse_name,
      v_item.stock_item_id,
      v_item.source_dimension_values,
      v_item.requested_dimension_values,
      v_item.allocated_quantity,
      v_item.remaining_dimension_values,
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

    v_line_no := v_line_no + 1;
  end loop;

  if v_total <> p_quantity then
    raise exception 'La hoja de corte no coincide con la cantidad ejecutada: % de %', v_total, p_quantity;
  end if;

  return v_work_sheet_id;
end;
$$;

grant execute on function public.execute_manual_dimensional_cut_with_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,numeric,jsonb,text,text) to authenticated;
