-- ONIN: una única hoja de confección de lona por línea de pedido.
-- La hoja contiene toda la información productiva de esa línea.

create unique index if not exists ux_production_work_sheet_lona_order_line
  on public.production_work_sheet (sales_order_line_id)
  where document_type = 'LONA_CONFECTION';

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
  p_selections jsonb default '[]'::jsonb
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
    required_length, required_dimension_values, quantity,
    unit_symbol, unit_code, reference, notes,
    selection_mode, selection_reason
  ) values (
    p_company_id, v_code, 'LONA_CONFECTION', now(), 'ISSUED',
    p_sales_order_id, p_sales_order_line_id, p_sales_order_line_no,
    p_product_id, p_product_code, p_product_name,
    p_characteristic_id, p_characteristic_code, p_characteristic_name,
    null, p_required_dimension_values, p_quantity,
    p_unit_symbol, p_unit_code, p_reference, p_notes,
    p_selection_mode, p_selection_reason
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

grant execute on function public.create_lona_confection_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,numeric,varchar,varchar,text,text,varchar,text,jsonb) to authenticated;
