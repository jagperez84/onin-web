-- Corrige dos huecos de trazabilidad en el corte manual de perfil (hoja de
-- corte generada desde un pedido):
--
-- 1) Los movimientos de almacén "Alta de remanente dimensional" y "Consumo
--    de stock dimensional" se veían sin la columna Dimensiones rellena
--    (dimension_values vacío). execute_manual_dimensional_cut() — la función
--    que realmente reserva/consume la pieza y da de alta el remanente — es
--    anterior a esta carpeta de migraciones (no está definida en ningún
--    archivo de aquí, igual que ya pasaba con la tabla quotation o la
--    columna commercial_id de sales_order) y no podemos ver ni tocar
--    directamente sus llamadas internas a register_stock_movement.
--
--    En su lugar, esta migración rellena esas dimensiones DESPUÉS de que
--    execute_manual_dimensional_cut() haya hecho su trabajo, dentro de
--    execute_manual_dimensional_cut_with_work_sheet() (que sí es nuestra):
--      - El remanente generado ya conoce su propio movimiento de alta vía
--        warehouse_stock_item.source_stock_movement_id (lo pone
--        register_stock_movement al crear la pieza) — enlace exacto, no es
--        una suposición.
--      - El movimiento de consumo no tiene ese enlace directo (solo se
--        guarda en la pieza que se crea, no en la que se consume), así que
--        se localiza por coincidencia (tipo, artículo, característica,
--        almacén, cantidad, dentro de esta misma ejecución) tomando siempre
--        el más antiguo aún sin rellenar — funciona porque las líneas de la
--        hoja de corte y sus movimientos de consumo se generan en el mismo
--        orden. Solo se toca dimension_values cuando está vacío: nunca pisa
--        un valor ya existente ni afecta a cantidades/stock.
--
-- 2) El enlace pedido/hoja de corte de la pieza remanente (source_sales_
--    order_id/source_work_sheet_id/...) dependía de "created_at >= instante
--    en que arrancó la función", una condición fràgil. Se sustituye por el
--    único criterio que de verdad identifica al remanente: su
--    parent_stock_item_id — una pieza física, una vez cortada, solo puede
--    tener como mucho un remanente propio, así que no hace falta acotar por
--    tiempo ni por estado.

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
  v_started_at timestamptz := clock_timestamp();
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad de la hoja de corte debe ser mayor que cero'; end if;
  if p_required_dimension_values is null or jsonb_typeof(p_required_dimension_values) <> 'array' or jsonb_array_length(p_required_dimension_values) <> 1 then raise exception 'La hoja de corte de perfil requiere una única dimensión de longitud'; end if;
  if (p_required_dimension_values->>0)::numeric <= 0 then raise exception 'La longitud de corte debe ser mayor que cero'; end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then raise exception 'La hoja de corte debe contener al menos una pieza seleccionada'; end if;

  v_reservation_id := public.execute_manual_dimensional_cut(p_company_id,p_product_id,p_characteristic_id,p_required_dimension_values,p_selections,p_reference,p_notes);
  v_code := public.generate_production_work_sheet_code(p_company_id);

  insert into public.production_work_sheet (company_id,code,document_type,issue_date,status,sales_order_id,sales_order_line_id,sales_order_line_no,product_id,product_code,product_name,characteristic_id,characteristic_code,characteristic_name,required_length,quantity,reference,notes)
  values (p_company_id,v_code,'PROFILE_CUT',now(),'ISSUED',p_sales_order_id,p_sales_order_line_id,p_sales_order_line_no,p_product_id,p_product_code,p_product_name,p_characteristic_id,p_characteristic_code,p_characteristic_name,(p_required_dimension_values->>0)::numeric,p_quantity,p_reference,p_notes)
  returning id into v_work_sheet_id;

  for v_item in
    select sri.id reservation_item_id,sri.stock_item_id,sri.allocated_quantity,sri.requested_dimension_values,sri.remaining_dimension_values,wsi.dimension_values source_dimension_values,ws.warehouse_id,w.code warehouse_code,w.name warehouse_name
    from public.stock_reservation_item sri
    join public.warehouse_stock_item wsi on wsi.id=sri.stock_item_id
    join public.warehouse_stock ws on ws.id=wsi.warehouse_stock_id
    join public.warehouse w on w.id=ws.warehouse_id
    where sri.reservation_id=v_reservation_id
    order by sri.id
  loop
    v_total:=v_total+v_item.allocated_quantity;
    insert into public.production_work_sheet_line (work_sheet_id,line_no,warehouse_id,warehouse_code,warehouse_name,stock_item_id,source_dimension_values,cut_dimension_values,quantity,remainder_dimension_values,selected_snapshot)
    values (v_work_sheet_id,v_line_no,v_item.warehouse_id,v_item.warehouse_code,v_item.warehouse_name,v_item.stock_item_id,v_item.source_dimension_values,v_item.requested_dimension_values,v_item.allocated_quantity,v_item.remaining_dimension_values,jsonb_build_object('reservation_id',v_reservation_id,'reservation_item_id',v_item.reservation_item_id,'stock_item_id',v_item.stock_item_id,'warehouse_id',v_item.warehouse_id,'warehouse_code',v_item.warehouse_code,'warehouse_name',v_item.warehouse_name,'source_dimension_values',v_item.source_dimension_values,'cut_dimension_values',v_item.requested_dimension_values,'quantity',v_item.allocated_quantity,'remainder_dimension_values',v_item.remaining_dimension_values));

    -- Enlaza el remanente (si lo hay) con el pedido/línea/hoja de corte que lo generó.
    -- parent_stock_item_id identifica de forma única a ese remanente: una pieza física
    -- consumida una vez no puede volver a generar otro.
    update public.warehouse_stock_item
    set remnant_generated_at=coalesce(remnant_generated_at,created_at),
        source_sales_order_id=p_sales_order_id,
        source_sales_order_line_id=p_sales_order_line_id,
        source_work_sheet_id=v_work_sheet_id,
        source_work_sheet_line_id=(select id from public.production_work_sheet_line where work_sheet_id=v_work_sheet_id and line_no=v_line_no),
        updated_at=now()
    where parent_stock_item_id=v_item.stock_item_id;

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
    -- que estas líneas.
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
            and sm2.warehouse_id = v_item.warehouse_id
            and sm2.quantity = v_item.allocated_quantity
            and sm2.movement_date >= v_started_at
            and (sm2.dimension_values is null or jsonb_array_length(sm2.dimension_values) = 0)
          order by sm2.id asc
          limit 1
       );
    end if;

    v_line_no:=v_line_no+1;
  end loop;
  if v_total<>p_quantity then raise exception 'La hoja de corte no coincide con la cantidad ejecutada: % de %',v_total,p_quantity; end if;
  return v_work_sheet_id;
end;
$$;

grant execute on function public.execute_manual_dimensional_cut_with_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,numeric,jsonb,text,text) to authenticated;
