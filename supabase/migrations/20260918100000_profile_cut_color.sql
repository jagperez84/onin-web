-- Corte de perfil: color en paralelo a la característica (fase 3).
--
-- production_work_sheet es la cabecera compartida por los tres documentos de
-- consumo de producción (PROFILE_CUT, LONA_CONFECTION, COMPONENT_CONSUMPTION),
-- así que añadir aquí color_id/color_code/color_name (denormalizados, igual que
-- characteristic_id/characteristic_code/characteristic_name) los deja
-- disponibles para los tres. Por ahora solo execute_manual_dimensional_cut_with_work_sheet
-- (corte de perfil) los rellena; lona y consumo de componentes quedan para una
-- fase posterior y siguen funcionando igual que hoy con estas columnas a NULL.

alter table public.production_work_sheet add column if not exists color_id bigint references public.color(id);
alter table public.production_work_sheet add column if not exists color_code varchar(100);
alter table public.production_work_sheet add column if not exists color_name text;

comment on column public.production_work_sheet.color_id is
  'Color concreto (vía characteristic_color) del artículo cortado/consumido. NULL si la característica no diferencia por color.';

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
  v_cut_result bigint;
  v_work_sheet_id bigint;
  v_code varchar;
  v_selection jsonb;
  v_line_no integer := 1;
  v_warehouse_id bigint;
  v_source_dims jsonb;
  v_source_length numeric;
  v_required_length numeric;
  v_qty numeric;
  v_remainder numeric;
  v_remainder_dims jsonb;
  v_warehouse_code varchar;
  v_warehouse_name text;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad de la hoja de corte debe ser mayor que cero';
  end if;
  if p_required_dimension_values is null or jsonb_typeof(p_required_dimension_values) <> 'array' then
    raise exception 'Las dimensiones de corte deben ser un array JSON';
  end if;
  if jsonb_array_length(p_required_dimension_values) <> 1 then
    raise exception 'La hoja de corte de perfil requiere actualmente una única dimensión de longitud';
  end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then
    raise exception 'La hoja de corte debe contener al menos una pieza seleccionada';
  end if;

  v_required_length := (p_required_dimension_values->>0)::numeric;
  if v_required_length <= 0 then
    raise exception 'La longitud de corte debe ser mayor que cero';
  end if;

  -- El corte y la creación del documento están dentro de la misma transacción.
  -- Si cualquiera de los dos falla, no queda ni consumo de stock ni documento.
  v_cut_result := public.execute_manual_dimensional_cut(
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

  for v_selection in select value from jsonb_array_elements(p_selections)
  loop
    v_warehouse_id := (v_selection->>'warehouse_id')::bigint;
    v_source_dims := coalesce(v_selection->'dimension_values', '[]'::jsonb);
    v_qty := coalesce((v_selection->>'quantity')::numeric, 0);

    if v_warehouse_id is null or v_qty <= 0 then
      raise exception 'Selección de stock inválida en la hoja de corte';
    end if;
    if jsonb_typeof(v_source_dims) <> 'array' or jsonb_array_length(v_source_dims) <> 1 then
      raise exception 'Cada pieza seleccionada debe tener una única dimensión de longitud';
    end if;

    v_source_length := (v_source_dims->>0)::numeric;
    v_remainder := greatest(0, v_source_length - v_required_length);
    v_remainder_dims := case when v_remainder > 0 then jsonb_build_array(v_remainder) else '[]'::jsonb end;

    select code, name into v_warehouse_code, v_warehouse_name
      from public.warehouse where id = v_warehouse_id;

    insert into public.production_work_sheet_line (
      work_sheet_id, line_no, warehouse_id, warehouse_code, warehouse_name,
      stock_item_id, source_dimension_values, cut_dimension_values,
      quantity, remainder_dimension_values, selected_snapshot
    ) values (
      v_work_sheet_id, v_line_no, v_warehouse_id, v_warehouse_code, v_warehouse_name,
      null, v_source_dims, p_required_dimension_values,
      v_qty, v_remainder_dims,
      jsonb_build_object(
        'warehouse_id', v_warehouse_id,
        'warehouse_code', v_warehouse_code,
        'warehouse_name', v_warehouse_name,
        'source_dimension_values', v_source_dims,
        'cut_dimension_values', p_required_dimension_values,
        'quantity', v_qty,
        'remainder_dimension_values', v_remainder_dims
      )
    );

    v_line_no := v_line_no + 1;
  end loop;

  return v_work_sheet_id;
end;
$$;

grant execute on function public.execute_manual_dimensional_cut_with_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,numeric,jsonb,text,text,bigint,varchar,text) to authenticated;
