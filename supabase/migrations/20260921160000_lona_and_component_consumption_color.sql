-- Color real en confección de lona y consumo de componentes (fase 4, cierra el
-- hueco documentado en 20260918100000_profile_cut_color.sql: "lona y consumo de
-- componentes quedan para una fase posterior").
--
-- 1. Confección de lona: create_lona_confection_work_sheet gana p_color_id/
--    p_color_code/p_color_name (igual que ya tiene execute_manual_dimensional_cut_with_work_sheet
--    para perfil) y los graba en production_work_sheet.color_id/color_code/color_name.
--    execute_lona_confection_work_sheet ya no hardcodea color_id a NULL en los
--    movimientos de consumo/remanente/merma: usa el de la pieza física real.
--
-- 2. Consumo de componentes/accesorios: production_work_sheet_line gana columnas
--    component_characteristic_id/code/name y component_color_id/code/name (una
--    hoja de consumo puede tener varias líneas, cada una con su propio
--    componente/característica/color, a diferencia de PROFILE_CUT/LONA_CONFECTION
--    donde todo el documento es un único artículo). register_stock_movement ya
--    no recibe characteristic_id/color_id hardcodeados a NULL: usa los de cada
--    línea, así que el descuento va a la partida de stock correcta en vez de
--    siempre "sin característica y sin color".

alter table public.production_work_sheet_line add column if not exists component_characteristic_id bigint references public.product_attribute(id);
alter table public.production_work_sheet_line add column if not exists component_characteristic_code varchar(100);
alter table public.production_work_sheet_line add column if not exists component_characteristic_name text;
alter table public.production_work_sheet_line add column if not exists component_color_id bigint references public.color(id);
alter table public.production_work_sheet_line add column if not exists component_color_code varchar(100);
alter table public.production_work_sheet_line add column if not exists component_color_name text;

comment on column public.production_work_sheet_line.component_characteristic_id is
  'Solo COMPONENT_CONSUMPTION: característica del componente de esta línea (puede variar línea a línea, a diferencia de la cabecera).';
comment on column public.production_work_sheet_line.component_color_id is
  'Solo COMPONENT_CONSUMPTION: color del componente de esta línea.';

-- create_lona_confection_work_sheet cambia su lista de parámetros (gana 3 nuevos
-- al final): hay que retirar el overload de 19 parámetros antes de recrearla, si
-- no Postgres deja las dos versiones conviviendo y una llamada con argumentos con
-- nombre que no mencione los nuevos queda ambigua entre ambas (mismo patrón de
-- bug ya corregido para create_lona_confection_work_sheet en 20260828100000 y
-- para create_and_execute_component_consumption_work_sheet en 20260828140000).
drop function if exists public.create_lona_confection_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,numeric,varchar,varchar,text,text,varchar,text,jsonb);

create or replace function public.create_lona_confection_work_sheet(
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
  p_unit_symbol varchar default null,
  p_unit_code varchar default null,
  p_reference text default null,
  p_notes text default null,
  p_selection_mode varchar default 'AUTOMATIC',
  p_selection_reason text default null,
  p_selections jsonb default '[]'::jsonb,
  p_color_id bigint default null,
  p_color_code varchar default null,
  p_color_name text default null
)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_work_sheet_id bigint;
  v_existing_id bigint;
  v_code varchar;
  v_selection jsonb;
  v_line_no integer := 1;
  v_total numeric := 0;
  v_qty numeric;
  v_source_dims jsonb;
  v_cut_dims jsonb;
  v_remainder_dims jsonb;
  v_warehouse_id bigint;
  v_stock_item_id bigint;
  v_warehouse_code varchar;
  v_warehouse_name text;
begin
  if p_company_id is null or p_sales_order_line_id is null or p_product_id is null then
    raise exception 'La hoja de confección necesita empresa, línea de pedido y artículo';
  end if;

  select id into v_existing_id
    from public.production_work_sheet
   where sales_order_line_id = p_sales_order_line_id
     and document_type = 'LONA_CONFECTION'
   order by id desc
   limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad de confección debe ser mayor que cero';
  end if;
  if p_required_dimension_values is null or jsonb_typeof(p_required_dimension_values) <> 'array' or jsonb_array_length(p_required_dimension_values) < 2 then
    raise exception 'La confección de lona requiere al menos dos dimensiones de corte';
  end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then
    raise exception 'La hoja de confección debe contener al menos un material seleccionado';
  end if;

  v_code := public.generate_production_work_sheet_code(p_company_id);

  insert into public.production_work_sheet (
    company_id, code, document_type, issue_date, status,
    sales_order_id, sales_order_line_id, sales_order_line_no,
    product_id, product_code, product_name,
    characteristic_id, characteristic_code, characteristic_name,
    color_id, color_code, color_name,
    required_length, required_dimension_values, quantity,
    unit_symbol, unit_code, reference, notes,
    selection_mode, selection_reason, created_by
  ) values (
    p_company_id, v_code, 'LONA_CONFECTION', now(), 'ISSUED',
    p_sales_order_id, p_sales_order_line_id, p_sales_order_line_no,
    p_product_id, p_product_code, p_product_name,
    p_characteristic_id, p_characteristic_code, p_characteristic_name,
    p_color_id, p_color_code, p_color_name,
    null, p_required_dimension_values, p_quantity,
    p_unit_symbol, p_unit_code, p_reference, p_notes,
    p_selection_mode, p_selection_reason, auth.uid()
  ) returning id into v_work_sheet_id;

  for v_selection in select value from jsonb_array_elements(p_selections)
  loop
    v_warehouse_id := nullif(v_selection->>'warehouse_id','')::bigint;
    v_stock_item_id := nullif(v_selection->>'stock_item_id','')::bigint;
    v_qty := coalesce((v_selection->>'quantity')::numeric, 0);
    v_source_dims := coalesce(v_selection->'source_dimension_values', '[]'::jsonb);
    v_cut_dims := coalesce(v_selection->'cut_dimension_values', p_required_dimension_values);
    v_remainder_dims := coalesce(v_selection->'remainder_dimension_values', '[]'::jsonb);

    if v_warehouse_id is null or v_qty <= 0 then
      raise exception 'Material seleccionado inválido en la hoja de confección';
    end if;
    if jsonb_typeof(v_source_dims) <> 'array' or jsonb_typeof(v_cut_dims) <> 'array' then
      raise exception 'Las dimensiones del material deben ser arrays JSON';
    end if;

    select code, name into v_warehouse_code, v_warehouse_name
      from public.warehouse where id = v_warehouse_id;

    insert into public.production_work_sheet_line (
      work_sheet_id, line_no, warehouse_id, warehouse_code, warehouse_name,
      stock_item_id, source_dimension_values, cut_dimension_values,
      quantity, remainder_dimension_values, selected_snapshot
    ) values (
      v_work_sheet_id, v_line_no, v_warehouse_id, v_warehouse_code, v_warehouse_name,
      v_stock_item_id, v_source_dims, v_cut_dims,
      v_qty, v_remainder_dims,
      v_selection || jsonb_build_object('warehouse_code', v_warehouse_code, 'warehouse_name', v_warehouse_name)
    );

    v_total := v_total + v_qty;
    v_line_no := v_line_no + 1;
  end loop;

  if v_total <> p_quantity then
    delete from public.production_work_sheet where id = v_work_sheet_id;
    raise exception 'La hoja de confección contiene % unidades de material para una necesidad de %', v_total, p_quantity;
  end if;

  return v_work_sheet_id;
exception
  when unique_violation then
    select id into v_existing_id
      from public.production_work_sheet
     where sales_order_line_id = p_sales_order_line_id
       and document_type = 'LONA_CONFECTION'
     order by id desc
     limit 1;
    if v_existing_id is not null then return v_existing_id; end if;
    raise;
end;
$$;

grant execute on function public.create_lona_confection_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,numeric,varchar,varchar,text,text,varchar,text,jsonb,bigint,varchar,text) to authenticated;

-- execute_lona_confection_work_sheet mantiene su firma (bigint) sin cambios: solo
-- deja de hardcodear color_id a NULL en los movimientos de stock y en el
-- remanente/merma generados, usando el color de la pieza física ya elegida
-- (v_item.color_id, que ya venía filtrado por color desde el TS que la asignó).
create or replace function public.execute_lona_confection_work_sheet(p_work_sheet_id bigint)
returns void language plpgsql security invoker as $$
declare
  v_sheet public.production_work_sheet%rowtype; v_line record; v_item public.warehouse_stock_item%rowtype; v_stock public.warehouse_stock%rowtype;
  v_product public.product%rowtype; v_family public.product_family%rowtype; v_type public.stock_movement_type%rowtype; v_movement_id bigint; v_new_item bigint;
  v_w numeric; v_h numeric; v_cw numeric; v_ch numeric; v_remnants jsonb; v_min numeric:=0; v_rotated boolean; v_is_continuation boolean;
  v_source_units jsonb; v_cut_units jsonb; v_remnant_units jsonb;
  v_ord_id bigint; v_ord_line_id bigint; v_ws_id bigint; v_ws_line_id bigint;
begin
  select * into v_sheet from public.production_work_sheet where id=p_work_sheet_id and document_type='LONA_CONFECTION' for update;
  if not found then raise exception 'Hoja de confección no encontrada'; end if;
  if v_sheet.status<>'ISSUED' then raise exception 'La hoja % no está pendiente de ejecución',v_sheet.code; end if;
  select * into v_product from public.product where id=v_sheet.product_id and company_id=v_sheet.company_id and deleted_at is null and active=true;
  if not found or not v_product.stock_enabled or not v_product.include_measurements_in_stock then raise exception 'El artículo no tiene stock dimensional activo'; end if;
  if v_product.family_id is not null then select * into v_family from public.product_family where id=v_product.family_id and deleted_at is null; if found then v_min:=coalesce(v_product.minimum_remainder,v_family.minimum_remainder,0); end if; end if;
  select * into v_type from public.stock_movement_type where company_id=v_sheet.company_id and code='DIMENSIONAL_CONSUMPTION' and active=true;
  if not found then raise exception 'No existe DIMENSIONAL_CONSUMPTION'; end if;
  for v_line in select * from public.production_work_sheet_line where work_sheet_id=p_work_sheet_id order by line_no loop
    if v_line.quantity<>1 or v_line.stock_item_id is null then raise exception 'La línea % no referencia una pieza física única de stock',v_line.line_no; end if;
    select * into v_item from public.warehouse_stock_item where id=v_line.stock_item_id for update;
    if not found or v_item.status<>'AVAILABLE' then raise exception 'La pieza de stock % ya no está disponible',v_line.stock_item_id; end if;
    if jsonb_array_length(v_item.dimension_values)<>2 or jsonb_array_length(v_line.cut_dimension_values)<>2 then raise exception 'La pieza % no tiene dos dimensiones válidas',v_line.stock_item_id; end if;
    v_w:=(v_item.dimension_values->>0)::numeric; v_h:=(v_item.dimension_values->>1)::numeric; v_cw:=(v_line.cut_dimension_values->>0)::numeric; v_ch:=(v_line.cut_dimension_values->>1)::numeric;
    if not ((v_w>=v_cw and v_h>=v_ch) or (v_w>=v_ch and v_h>=v_cw)) then raise exception 'La pieza % ya no permite el corte solicitado',v_line.stock_item_id; end if;
    v_rotated:=not(v_w>=v_cw and v_h>=v_ch); if v_rotated then v_cw:=(v_line.cut_dimension_values->>1)::numeric; v_ch:=(v_line.cut_dimension_values->>0)::numeric; end if;
    v_source_units:=coalesce(v_item.dimension_units,v_line.source_dimension_units,'[]'::jsonb); v_cut_units:=coalesce(v_line.cut_dimension_units,v_sheet.required_dimension_units,'[]'::jsonb);
    select * into v_stock from public.warehouse_stock where id=v_item.warehouse_stock_id for update;
    insert into public.stock_movement(company_id,warehouse_id,product_id,movement_type_id,characteristic_id,color_id,quantity,movement_date,reference,notes,dimension_values,dimension_units,warehouse_stock_item_id)
    values(v_sheet.company_id,v_stock.warehouse_id,v_item.product_id,v_type.id,v_item.characteristic_id,v_item.color_id,1,now(),v_sheet.reference,'Consumo de lona 2D · '||v_sheet.code,jsonb_build_array(v_cw,v_ch),v_cut_units,v_item.id) returning id into v_movement_id;
    update public.warehouse_stock_item set status='CONSUMED',source_stock_movement_id=v_movement_id,updated_at=now() where id=v_item.id;
    update public.warehouse_stock set quantity=greatest(0,quantity-1),reserved_quantity=greatest(0,reserved_quantity-1),updated_at=now() where id=v_item.warehouse_stock_id;
    v_remnants:='[]'::jsonb; if v_w-v_cw>0 and v_ch>0 then v_remnants:=v_remnants||jsonb_build_array(jsonb_build_array(v_w-v_cw,v_ch)); end if; if v_h-v_ch>0 and v_w>0 then v_remnants:=v_remnants||jsonb_build_array(jsonb_build_array(v_w,v_h-v_ch)); end if;
    v_remnant_units:=v_source_units;
    update public.production_work_sheet_line set remainder_pieces=v_remnants,selected_snapshot=selected_snapshot||jsonb_build_object('executed',true,'rotated',v_rotated,'remainder_pieces',v_remnants) where id=v_line.id;
    for v_cw,v_ch in select (x->>0)::numeric,(x->>1)::numeric from jsonb_array_elements(v_remnants) x loop
      -- Una franja con el mismo ancho que la pieza original no es un resto generado por este
      -- corte: es la misma pieza de origen, acortada. Solo el resto de ancho distinto (subproducto
      -- real de este corte) se liga al pedido y a la hoja que lo originaron.
      v_is_continuation:=(v_cw=v_w);
      if v_is_continuation then v_ord_id:=null; v_ord_line_id:=null; v_ws_id:=null; v_ws_line_id:=null;
      else v_ord_id:=v_sheet.sales_order_id; v_ord_line_id:=v_sheet.sales_order_line_id; v_ws_id:=p_work_sheet_id; v_ws_line_id:=v_line.id;
      end if;
      if greatest(v_cw,v_ch)>=v_min and v_cw>0 and v_ch>0 then
        insert into public.warehouse_stock_item(warehouse_stock_id,product_id,characteristic_id,color_id,quantity,dimension_values,dimension_units,status,parent_stock_item_id,source_stock_movement_id,source_sales_order_id,source_sales_order_line_id,source_work_sheet_id,source_work_sheet_line_id,remnant_generated_at)
        values(v_item.warehouse_stock_id,v_item.product_id,v_item.characteristic_id,v_item.color_id,1,jsonb_build_array(v_cw,v_ch),v_remnant_units,'AVAILABLE',v_item.id,null,v_ord_id,v_ord_line_id,v_ws_id,v_ws_line_id,now()) returning id into v_new_item;
        select * into v_type from public.stock_movement_type where company_id=v_sheet.company_id and code='DIMENSIONAL_REMNANT' and active=true; if not found then raise exception 'No existe DIMENSIONAL_REMNANT'; end if;
        insert into public.stock_movement(company_id,warehouse_id,product_id,movement_type_id,characteristic_id,color_id,quantity,movement_date,reference,notes,dimension_values,dimension_units,warehouse_stock_item_id)
        values(v_sheet.company_id,v_stock.warehouse_id,v_item.product_id,v_type.id,v_item.characteristic_id,v_item.color_id,1,now(),v_sheet.reference,'Remanente de lona · '||v_sheet.code,jsonb_build_array(v_cw,v_ch),v_remnant_units,v_new_item) returning id into v_movement_id;
        update public.warehouse_stock_item set source_stock_movement_id=v_movement_id where id=v_new_item; update public.warehouse_stock set quantity=quantity+1,updated_at=now() where id=v_item.warehouse_stock_id;
      else
        select * into v_type from public.stock_movement_type where company_id=v_sheet.company_id and code='DIMENSIONAL_SCRAP' and active=true; if not found then raise exception 'No existe DIMENSIONAL_SCRAP'; end if;
        insert into public.stock_movement(company_id,warehouse_id,product_id,movement_type_id,characteristic_id,color_id,quantity,movement_date,reference,notes,dimension_values,dimension_units,warehouse_stock_item_id)
        values(v_sheet.company_id,v_stock.warehouse_id,v_item.product_id,v_type.id,v_item.characteristic_id,v_item.color_id,1,now(),v_sheet.reference,'Merma de lona · '||v_sheet.code,jsonb_build_array(v_cw,v_ch),v_remnant_units,v_item.id);
      end if;
    end loop;
  end loop;
  update public.production_work_sheet set status='COMPLETED',updated_at=now() where id=p_work_sheet_id;
end; $$;
grant execute on function public.execute_lona_confection_work_sheet(bigint) to authenticated;

-- create_and_execute_component_consumption_work_sheet mantiene su firma (misma
-- lista de tipos: p_lines sigue siendo un único parámetro jsonb) sin cambios: la
-- característica/color de cada componente van dentro de cada elemento de p_lines,
-- ya que una misma hoja puede descontar varios componentes distintos.
create or replace function public.create_and_execute_component_consumption_work_sheet(
  p_company_id bigint,
  p_sales_order_id bigint,
  p_sales_order_line_id bigint,
  p_sales_order_line_no integer,
  p_product_id bigint,
  p_product_code varchar,
  p_product_name text,
  p_quantity numeric,
  p_lines jsonb,
  p_reference text default null,
  p_notes text default null
)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_work_sheet_id bigint;
  v_existing_id bigint;
  v_code varchar;
  v_line jsonb;
  v_line_no integer := 1;
  v_warehouse_id bigint;
  v_component_product_id bigint;
  v_component_product_code varchar;
  v_component_product_name text;
  v_component_unit_code varchar;
  v_component_characteristic_id bigint;
  v_component_characteristic_code varchar;
  v_component_characteristic_name text;
  v_component_color_id bigint;
  v_component_color_code varchar;
  v_component_color_name text;
  v_qty numeric;
  v_warehouse_code varchar;
  v_warehouse_name text;
  v_movement_id bigint;
  v_component_product public.product%rowtype;
begin
  if p_company_id is null or p_sales_order_line_id is null then
    raise exception 'La hoja de componentes necesita empresa y línea de pedido';
  end if;

  select id into v_existing_id
    from public.production_work_sheet
   where sales_order_line_id = p_sales_order_line_id
     and document_type = 'COMPONENT_CONSUMPTION'
   order by id desc
   limit 1;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad de la línea debe ser mayor que cero';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'La hoja de componentes debe contener al menos un componente';
  end if;

  v_code := public.generate_production_work_sheet_code(p_company_id);

  insert into public.production_work_sheet (
    company_id, code, document_type, issue_date, status,
    sales_order_id, sales_order_line_id, sales_order_line_no,
    product_id, product_code, product_name,
    required_length, quantity, reference, notes
  ) values (
    p_company_id, v_code, 'COMPONENT_CONSUMPTION', now(), 'ISSUED',
    p_sales_order_id, p_sales_order_line_id, p_sales_order_line_no,
    p_product_id, p_product_code, p_product_name,
    null, p_quantity, p_reference, p_notes
  ) returning id into v_work_sheet_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_warehouse_id := nullif(v_line->>'warehouse_id','')::bigint;
    v_component_product_id := nullif(v_line->>'product_id','')::bigint;
    v_component_product_code := v_line->>'product_code';
    v_component_product_name := v_line->>'product_name';
    v_component_unit_code := v_line->>'unit_code';
    v_component_characteristic_id := nullif(v_line->>'characteristic_id','')::bigint;
    v_component_characteristic_code := v_line->>'characteristic_code';
    v_component_characteristic_name := v_line->>'characteristic_name';
    v_component_color_id := nullif(v_line->>'color_id','')::bigint;
    v_component_color_code := v_line->>'color_code';
    v_component_color_name := v_line->>'color_name';
    v_qty := coalesce((v_line->>'quantity')::numeric, 0);

    if v_warehouse_id is null or v_component_product_id is null or v_qty <= 0 then
      raise exception 'Componente inválido en la hoja de consumo';
    end if;

    select * into v_component_product from public.product where id = v_component_product_id and company_id = p_company_id and deleted_at is null;
    if not found then
      raise exception 'El componente % no existe para la empresa indicada', v_component_product_id;
    end if;
    if coalesce(v_component_product.include_measurements_in_stock, false) then
      raise exception 'El componente % es un artículo dimensional; no puede consumirse como unidad simple', coalesce(v_component_product_code, v_component_product.code);
    end if;

    select code, name into v_warehouse_code, v_warehouse_name
      from public.warehouse where id = v_warehouse_id;

    insert into public.production_work_sheet_line (
      work_sheet_id, line_no, warehouse_id, warehouse_code, warehouse_name,
      quantity, component_product_id, component_product_code, component_product_name,
      component_unit_code,
      component_characteristic_id, component_characteristic_code, component_characteristic_name,
      component_color_id, component_color_code, component_color_name,
      selected_snapshot
    ) values (
      v_work_sheet_id, v_line_no, v_warehouse_id, v_warehouse_code, v_warehouse_name,
      v_qty, v_component_product_id, v_component_product_code, v_component_product_name,
      v_component_unit_code,
      v_component_characteristic_id, v_component_characteristic_code, v_component_characteristic_name,
      v_component_color_id, v_component_color_code, v_component_color_name,
      jsonb_build_object(
        'warehouse_id', v_warehouse_id, 'warehouse_code', v_warehouse_code, 'warehouse_name', v_warehouse_name,
        'product_id', v_component_product_id, 'product_code', v_component_product_code,
        'product_name', v_component_product_name, 'unit_code', v_component_unit_code, 'quantity', v_qty,
        'characteristic_id', v_component_characteristic_id, 'color_id', v_component_color_id
      )
    );

    v_movement_id := public.register_stock_movement(
      p_company_id, v_warehouse_id, v_component_product_id, v_qty, 'COMPONENT_CONSUMPTION',
      v_component_characteristic_id, p_reference, coalesce(p_notes, 'Consumo de componente · ' || v_code), now(), null, null, v_component_color_id
    );

    v_line_no := v_line_no + 1;
  end loop;

  update public.production_work_sheet set status = 'COMPLETED', updated_at = now() where id = v_work_sheet_id;

  return v_work_sheet_id;
exception
  when unique_violation then
    select id into v_existing_id
      from public.production_work_sheet
     where sales_order_line_id = p_sales_order_line_id
       and document_type = 'COMPONENT_CONSUMPTION'
     order by id desc
     limit 1;
    if v_existing_id is not null then return v_existing_id; end if;
    raise;
end;
$$;

grant execute on function public.create_and_execute_component_consumption_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,numeric,jsonb,text,text) to authenticated;
