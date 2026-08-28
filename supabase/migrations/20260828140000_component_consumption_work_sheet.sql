-- ONIN: descuento de componentes por unidades (soportes, motores, tornillería...)
-- al fabricar una línea de pedido. Hasta ahora el despiece (BOM/OTD) solo se usaba
-- para calcular precio y previsualizar disponibilidad; nunca se descontaba stock
-- real. Se añade un tercer tipo de hoja de producción, "COMPONENT_CONSUMPTION",
-- con el mismo patrón que PROFILE_CUT/LONA_CONFECTION: una hoja por línea de
-- pedido, con una línea por componente. A diferencia de las hojas dimensionales,
-- aquí no hay selección de pieza física que hacer (los componentes se llevan por
-- unidades en warehouse_stock, no por warehouse_stock_item) así que la hoja se
-- crea y se ejecuta en la misma transacción: no tiene sentido un estado
-- intermedio "emitida pero no descontada" para un simple conteo de unidades.

-- register_stock_movement() ganó un parámetro p_dimension_values en 20260827160000/161000
-- vía `create or replace`, pero como cambia la lista de tipos de parámetros eso NO
-- reemplaza la función original de 10 parámetros: crea un segundo overload huérfano que
-- convive con el nuevo. Una llamada con argumentos con nombre que no mencione
-- p_dimension_values (como la que hace esta migración) es ambigua entre ambos y Postgres
-- la rechaza con "function is not unique". Mismo patrón de bug que ya se corrigió para
-- create_lona_confection_work_sheet en 20260828100000; se retira aquí el overload huérfano.
drop function if exists public.register_stock_movement(bigint,bigint,bigint,numeric,varchar,bigint,varchar,text,timestamptz,uuid);

alter table public.production_work_sheet
  drop constraint if exists production_work_sheet_type_ck;

alter table public.production_work_sheet
  add constraint production_work_sheet_type_ck
  check (document_type in ('PROFILE_CUT','LONA_CONFECTION','COMPONENT_CONSUMPTION'));

alter table public.production_work_sheet_line
  add column if not exists component_product_id bigint references public.product(id);

alter table public.production_work_sheet_line
  add column if not exists component_product_code varchar(100);

alter table public.production_work_sheet_line
  add column if not exists component_product_name text;

alter table public.production_work_sheet_line
  add column if not exists component_unit_code varchar(30);

create unique index if not exists ux_production_work_sheet_components_order_line
  on public.production_work_sheet (sales_order_line_id)
  where document_type = 'COMPONENT_CONSUMPTION';

insert into public.stock_movement_type (company_id, code, name, direction, active)
select c.id, 'COMPONENT_CONSUMPTION', 'Consumo de componente de fabricación', -1, true
from public.company c
where not exists (
  select 1 from public.stock_movement_type t
  where t.company_id = c.id and t.code = 'COMPONENT_CONSUMPTION'
);

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
      component_unit_code, selected_snapshot
    ) values (
      v_work_sheet_id, v_line_no, v_warehouse_id, v_warehouse_code, v_warehouse_name,
      v_qty, v_component_product_id, v_component_product_code, v_component_product_name,
      v_component_unit_code,
      jsonb_build_object(
        'warehouse_id', v_warehouse_id, 'warehouse_code', v_warehouse_code, 'warehouse_name', v_warehouse_name,
        'product_id', v_component_product_id, 'product_code', v_component_product_code,
        'product_name', v_component_product_name, 'unit_code', v_component_unit_code, 'quantity', v_qty
      )
    );

    v_movement_id := public.register_stock_movement(
      p_company_id, v_warehouse_id, v_component_product_id, v_qty, 'COMPONENT_CONSUMPTION',
      null, p_reference, coalesce(p_notes, 'Consumo de componente · ' || v_code), now(), null, null
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
