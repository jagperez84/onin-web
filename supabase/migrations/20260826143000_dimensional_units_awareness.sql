-- ONIN: las dimensiones físicas deben conservar también su unidad de medida.
-- Los valores dimensionales siguen siendo arrays ordenados según el Tipo de Medida;
-- dimension_units conserva el código de unidad correspondiente a cada posición.

alter table public.warehouse_stock_item
  add column if not exists dimension_units jsonb not null default '[]'::jsonb;

alter table public.stock_movement
  add column if not exists dimension_units jsonb not null default '[]'::jsonb;

alter table public.stock_reservation
  add column if not exists dimension_units jsonb not null default '[]'::jsonb;

alter table public.production_work_sheet
  add column if not exists required_dimension_units jsonb not null default '[]'::jsonb;

alter table public.production_work_sheet_line
  add column if not exists source_dimension_units jsonb not null default '[]'::jsonb;

alter table public.production_work_sheet_line
  add column if not exists cut_dimension_units jsonb not null default '[]'::jsonb;

alter table public.production_work_sheet_line
  add column if not exists remainder_dimension_units jsonb not null default '[]'::jsonb;

alter table public.warehouse_stock_item
  add constraint warehouse_stock_item_dimension_units_array_ck
  check (jsonb_typeof(dimension_units) = 'array');

alter table public.stock_movement
  add constraint stock_movement_dimension_units_array_ck
  check (jsonb_typeof(dimension_units) = 'array');

alter table public.stock_reservation
  add constraint stock_reservation_dimension_units_array_ck
  check (jsonb_typeof(dimension_units) = 'array');

alter table public.production_work_sheet
  add constraint production_work_sheet_required_dimension_units_ck
  check (jsonb_typeof(required_dimension_units) = 'array');

alter table public.production_work_sheet_line
  add constraint production_work_sheet_line_source_units_ck
  check (jsonb_typeof(source_dimension_units) = 'array');

alter table public.production_work_sheet_line
  add constraint production_work_sheet_line_cut_units_ck
  check (jsonb_typeof(cut_dimension_units) = 'array');

alter table public.production_work_sheet_line
  add constraint production_work_sheet_line_remainder_units_ck
  check (jsonb_typeof(remainder_dimension_units) = 'array');

-- Backfill de existencias dimensionales ya materializadas.
-- Se utiliza la definición dimensional efectiva del artículo (artículo > familia)
-- para recuperar la unidad de cada posición.
update public.warehouse_stock_item wsi
set dimension_units = coalesce(src.units, '[]'::jsonb)
from (
  select
    w.id,
    coalesce(
      (
        select jsonb_agg(coalesce(u.code, u.name) order by mtd.dimension_number)
        from public.measurement_type_dimension mtd
        left join public.unit u on u.id = mtd.unit_id
        where mtd.measurement_type_id = p.measurement_type_id
      ),
      (
        select jsonb_agg(coalesce(u.code, u.name) order by mtd.dimension_number)
        from public.measurement_type_dimension mtd
        left join public.unit u on u.id = mtd.unit_id
        where mtd.measurement_type_id = pf.measurement_type_id
      ),
      '[]'::jsonb
    ) as units
  from public.warehouse_stock_item w
  join public.product p on p.id = w.product_id
  left join public.product_family pf on pf.id = p.family_id
) src
where wsi.id = src.id
  and jsonb_array_length(wsi.dimension_values) > 0
  and jsonb_array_length(wsi.dimension_units) = 0;

comment on column public.warehouse_stock_item.dimension_units is
  'Unidades de cada dimensión física, en el mismo orden que dimension_values. Ejemplo ["cm","cm"].';
comment on column public.stock_movement.dimension_units is
  'Unidades de las dimensiones físicas almacenadas en dimension_values.';
comment on column public.stock_reservation.dimension_units is
  'Unidades de las dimensiones solicitadas/reservadas.';
comment on column public.production_work_sheet.required_dimension_units is
  'Unidades de las dimensiones requeridas por la confección.';
comment on column public.production_work_sheet_line.source_dimension_units is
  'Unidades de las dimensiones físicas de la pieza de origen.';
comment on column public.production_work_sheet_line.cut_dimension_units is
  'Unidades de las dimensiones del corte realizado/propuesto.';
comment on column public.production_work_sheet_line.remainder_dimension_units is
  'Unidades de las dimensiones del remanente.';

-- Nueva versión de la función de creación de hojas de confección.
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
  p_required_dimension_units jsonb,
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
  v_code varchar;
  v_selection jsonb;
  v_line_no integer := 1;
  v_total numeric := 0;
  v_qty numeric;
  v_source_dims jsonb;
  v_source_units jsonb;
  v_cut_dims jsonb;
  v_cut_units jsonb;
  v_remainder_dims jsonb;
  v_remainder_units jsonb;
  v_warehouse_id bigint;
  v_stock_item_id bigint;
  v_warehouse_code varchar;
  v_warehouse_name text;
begin
  if p_company_id is null or p_sales_order_line_id is null or p_product_id is null then
    raise exception 'La hoja de confección necesita empresa, línea de pedido y artículo';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad de confección debe ser mayor que cero';
  end if;
  if p_required_dimension_values is null or jsonb_typeof(p_required_dimension_values) <> 'array' or jsonb_array_length(p_required_dimension_values) < 2 then
    raise exception 'La confección de lona requiere al menos dos dimensiones de corte';
  end if;
  if p_required_dimension_units is null or jsonb_typeof(p_required_dimension_units) <> 'array' or jsonb_array_length(p_required_dimension_units) <> jsonb_array_length(p_required_dimension_values) then
    raise exception 'Las unidades de las dimensiones requeridas no son válidas';
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
    required_length, required_dimension_values, required_dimension_units, quantity,
    unit_symbol, unit_code, reference, notes,
    selection_mode, selection_reason
  ) values (
    p_company_id, v_code, 'LONA_CONFECTION', now(), 'ISSUED',
    p_sales_order_id, p_sales_order_line_id, p_sales_order_line_no,
    p_product_id, p_product_code, p_product_name,
    p_characteristic_id, p_characteristic_code, p_characteristic_name,
    null, p_required_dimension_values, p_required_dimension_units, p_quantity,
    p_unit_symbol, p_unit_code, p_reference, p_notes,
    p_selection_mode, p_selection_reason
  ) returning id into v_work_sheet_id;

  for v_selection in select value from jsonb_array_elements(p_selections)
  loop
    v_warehouse_id := nullif(v_selection->>'warehouse_id','')::bigint;
    v_stock_item_id := nullif(v_selection->>'stock_item_id','')::bigint;
    v_qty := coalesce((v_selection->>'quantity')::numeric, 0);
    v_source_dims := coalesce(v_selection->'source_dimension_values', '[]'::jsonb);
    v_source_units := coalesce(v_selection->'source_dimension_units', '[]'::jsonb);
    v_cut_dims := coalesce(v_selection->'cut_dimension_values', p_required_dimension_values);
    v_cut_units := coalesce(v_selection->'cut_dimension_units', p_required_dimension_units);
    v_remainder_dims := coalesce(v_selection->'remainder_dimension_values', '[]'::jsonb);
    v_remainder_units := coalesce(v_selection->'remainder_dimension_units', v_source_units);

    if v_warehouse_id is null or v_qty <= 0 then
      raise exception 'Material seleccionado inválido en la hoja de confección';
    end if;
    if jsonb_typeof(v_source_dims) <> 'array' or jsonb_typeof(v_source_units) <> 'array' then
      raise exception 'Las dimensiones y unidades del material deben ser arrays JSON';
    end if;
    if jsonb_array_length(v_source_dims) <> jsonb_array_length(v_source_units) then
      raise exception 'La pieza seleccionada no tiene una unidad para cada dimensión';
    end if;
    if jsonb_typeof(v_cut_dims) <> 'array' or jsonb_typeof(v_cut_units) <> 'array' or jsonb_array_length(v_cut_dims) <> jsonb_array_length(v_cut_units) then
      raise exception 'Las dimensiones y unidades del corte no son coherentes';
    end if;
    if jsonb_typeof(v_remainder_dims) <> 'array' or jsonb_typeof(v_remainder_units) <> 'array' then
      raise exception 'Las dimensiones y unidades del remanente no son válidas';
    end if;

    select code, name into v_warehouse_code, v_warehouse_name
      from public.warehouse where id = v_warehouse_id;

    insert into public.production_work_sheet_line (
      work_sheet_id, line_no, warehouse_id, warehouse_code, warehouse_name,
      stock_item_id, source_dimension_values, source_dimension_units,
      cut_dimension_values, cut_dimension_units,
      quantity, remainder_dimension_values, remainder_dimension_units, selected_snapshot
    ) values (
      v_work_sheet_id, v_line_no, v_warehouse_id, v_warehouse_code, v_warehouse_name,
      v_stock_item_id, v_source_dims, v_source_units,
      v_cut_dims, v_cut_units,
      v_qty, v_remainder_dims, v_remainder_units,
      v_selection || jsonb_build_object(
        'warehouse_code', v_warehouse_code,
        'warehouse_name', v_warehouse_name
      )
    );

    v_total := v_total + v_qty;
    v_line_no := v_line_no + 1;
  end loop;

  if v_total <> p_quantity then
    delete from public.production_work_sheet where id = v_work_sheet_id;
    raise exception 'La hoja de confección contiene % unidades de material para una necesidad de %', v_total, p_quantity;
  end if;

  return v_work_sheet_id;
end;
$$;

grant execute on function public.create_lona_confection_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,jsonb,numeric,varchar,varchar,text,text,varchar,text,jsonb) to authenticated;
