-- ONIN: una entrada de stock dimensional debe crear la pieza física
-- que posteriormente utiliza el motor de reservas/corte.
-- Las dimensiones se reciben como objeto {codigo_dimension: valor} desde el formulario
-- y se materializan como arrays ordenados por dimension_number.

create or replace function public.register_stock_movement(
  p_company_id bigint,
  p_warehouse_id bigint,
  p_product_id bigint,
  p_quantity numeric,
  p_movement_type_code character varying,
  p_characteristic_id bigint default null,
  p_reference character varying default null,
  p_notes text default null,
  p_movement_date timestamp with time zone default now(),
  p_transfer_group_id uuid default null,
  p_dimension_values jsonb default null
)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_product public.product%rowtype;
  v_warehouse public.warehouse%rowtype;
  v_type public.stock_movement_type%rowtype;
  v_stock public.warehouse_stock%rowtype;
  v_has_characteristics boolean;
  v_signed numeric;
  v_movement_id bigint;
  v_dimension_array jsonb := '[]'::jsonb;
  v_dimension_units jsonb := '[]'::jsonb;
  v_dimension_count integer := 0;
  v_measurement_type_id bigint;
  v_item_quantity integer;
  v_item_index integer;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero';
  end if;

  select * into v_product
  from public.product
  where id = p_product_id
    and company_id = p_company_id
    and deleted_at is null;
  if not found then
    raise exception 'El artículo no existe para la empresa indicada';
  end if;

  if not v_product.stock_enabled then
    raise exception 'El artículo % no tiene la gestión de stock activada', v_product.code;
  end if;

  select * into v_warehouse
  from public.warehouse
  where id = p_warehouse_id
    and company_id = p_company_id
    and deleted_at is null;
  if not found then
    raise exception 'El almacén no existe para la empresa indicada';
  end if;
  if not v_warehouse.active then
    raise exception 'El almacén está inactivo';
  end if;

  select * into v_type
  from public.stock_movement_type
  where company_id = p_company_id
    and code = p_movement_type_code
    and active = true;
  if not found then
    raise exception 'Tipo de movimiento no válido: %', p_movement_type_code;
  end if;

  select exists (
    select 1
    from public.product_characteristic pc
    where pc.product_id = p_product_id
      and pc.deleted_at is null
      and pc.active = true
  ) into v_has_characteristics;

  if p_characteristic_id is not null then
    perform 1
    from public.product_characteristic pc
    where pc.id = p_characteristic_id
      and pc.product_id = p_product_id
      and pc.deleted_at is null
      and pc.active = true;
    if not found then
      raise exception 'La característica no pertenece al artículo o no está activa';
    end if;
  elsif v_product.include_stock_by_color and v_has_characteristics then
    raise exception 'El artículo requiere característica para gestionar stock por color';
  end if;

  -- Normaliza las dimensiones según la definición efectiva del artículo.
  -- Primero se utiliza la definición propia y, si no existe, la de la familia.
  if p_dimension_values is not null
     and jsonb_typeof(p_dimension_values) = 'object'
     and jsonb_object_length(p_dimension_values) > 0 then
    v_measurement_type_id := v_product.measurement_type_id;
    if v_measurement_type_id is null and v_product.family_id is not null then
      select pf.measurement_type_id into v_measurement_type_id
      from public.product_family pf
      where pf.id = v_product.family_id
        and pf.deleted_at is null;
    end if;

    if v_measurement_type_id is not null then
      select
        coalesce(jsonb_agg(
          case
            when p_dimension_values ? mtd.code
              then to_jsonb((p_dimension_values ->> mtd.code)::numeric)
            else 'null'::jsonb
          end
          order by mtd.dimension_number
        ), '[]'::jsonb),
        coalesce(jsonb_agg(
          coalesce(u.code, u.name)
          order by mtd.dimension_number
        ), '[]'::jsonb),
        count(*)
      into v_dimension_array, v_dimension_units, v_dimension_count
      from public.measurement_type_dimension mtd
      left join public.unit u on u.id = mtd.unit_id
      where mtd.measurement_type_id = v_measurement_type_id;
    end if;

    -- Algunos artículos antiguos solo tienen dimension_count sin filas de
    -- measurement_type_dimension. En ese caso conservamos el orden recibido
    -- por el formulario y dejamos las unidades vacías, sin perder los valores.
    if v_dimension_count = 0 then
      select coalesce(jsonb_agg(to_jsonb(value)), '[]'::jsonb)
      into v_dimension_array
      from jsonb_each_text(p_dimension_values) as e(key, value);
      v_dimension_units := '[]'::jsonb;
    end if;
  end if;

  v_signed := p_quantity * v_type.direction;

  select * into v_stock
  from public.warehouse_stock
  where warehouse_id = p_warehouse_id
    and product_id = p_product_id
    and characteristic_id is not distinct from p_characteristic_id
  for update;

  if not found then
    insert into public.warehouse_stock (
      warehouse_id, product_id, characteristic_id, quantity, reserved_quantity
    ) values (
      p_warehouse_id, p_product_id, p_characteristic_id, 0, 0
    ) returning * into v_stock;
  end if;

  if v_signed < 0
     and not v_product.allow_negative_stock
     and (v_stock.quantity + v_signed) < 0 then
    raise exception 'Stock insuficiente. Disponible físico: %', v_stock.quantity;
  end if;

  update public.warehouse_stock
  set quantity = quantity + v_signed,
      updated_at = now()
  where id = v_stock.id;

  insert into public.stock_movement (
    company_id, warehouse_id, product_id, movement_type_id,
    characteristic_id, quantity, movement_date, reference, notes,
    transfer_group_id, dimension_values, dimension_units
  ) values (
    p_company_id, p_warehouse_id, p_product_id, v_type.id,
    p_characteristic_id, p_quantity, p_movement_date, p_reference, p_notes,
    p_transfer_group_id,
    case when jsonb_array_length(v_dimension_array) > 0 then v_dimension_array else p_dimension_values end,
    v_dimension_units
  )
  returning id into v_movement_id;

  -- Una entrada dimensional representa piezas físicas independientes.
  -- Se crean solo para movimientos positivos y cuando existen dimensiones.
  -- Una salida no crea piezas; el consumo dimensional existente se gestiona
  -- mediante las reservas y su función de consumo.
  if v_signed > 0
     and v_dimension_array is not null
     and jsonb_typeof(v_dimension_array) = 'array'
     and jsonb_array_length(v_dimension_array) > 0
     and coalesce(v_product.include_measurements_in_stock, false) then
    if p_quantity <> trunc(p_quantity) then
      raise exception 'El stock dimensional se registra por piezas físicas completas';
    end if;

    v_item_quantity := trunc(p_quantity)::integer;
    for v_item_index in 1..v_item_quantity loop
      insert into public.warehouse_stock_item (
        warehouse_stock_id,
        product_id,
        characteristic_id,
        quantity,
        dimension_values,
        dimension_units,
        status,
        source_stock_movement_id
      ) values (
        v_stock.id,
        p_product_id,
        p_characteristic_id,
        1,
        v_dimension_array,
        v_dimension_units,
        'AVAILABLE',
        v_movement_id
      );
    end loop;
  end if;

  return v_movement_id;
end;
$$;

-- Mantener permisos de la función pública para el cliente web.
grant execute on function public.register_stock_movement(bigint,bigint,bigint,numeric,character varying,bigint,character varying,text,timestamp with time zone,uuid,jsonb) to authenticated;
