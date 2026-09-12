-- Entrega parcial de pedidos y montajes por línea.
--
-- Hasta ahora un pedido tenía como mucho UN montaje (ux_installation_order_active)
-- y el albarán se generaba de golpe con TODAS las líneas del pedido al completarse
-- ese montaje único. Eso no permite:
--   - entregar un artículo simple (no OTD) en varias veces (ej. 4 sillas: 2 hoy, 2
--     luego), porque no había ningún sitio donde apuntar cuánto se había entregado
--     ya de una línea;
--   - instalar un pedido de varios toldos (líneas OTD) en visitas separadas, porque
--     una instalación cubría "el pedido", no un subconjunto de sus líneas.
--
-- No cambia el principio ya existente en el código: los movimientos de consumo de
-- fabricación (COMPONENT_CONSUMPTION, DIMENSIONAL_CONSUMPTION/REMNANT/SCRAP) siguen
-- sin tener relación con ningún documento de cliente. Esto añade el movimiento que
-- faltaba — la entrega real al cliente — como un tipo más, igual de aislado.
--
-- Una línea OTD (product_id is null, viene del configurador OTD del presupuesto) se
-- sigue entregando siempre entera, nunca por cantidad parcial — "no tiene sentido
-- entregar medio toldo" — pero SÍ puede quedar cubierta por una instalación distinta
-- de las demás líneas del mismo pedido (entrega/montaje parcial por líneas).

-- 1) Tipo de movimiento de entrega a cliente, mismo patrón que COMPONENT_CONSUMPTION.
insert into public.stock_movement_type (company_id, code, name, direction, active)
select c.id, 'DELIVERY', 'Salida por entrega a cliente', -1, true
from public.company c
where not exists (
  select 1 from public.stock_movement_type t where t.company_id = c.id and t.code = 'DELIVERY'
);

-- 2) Un pedido puede tener varias instalaciones activas a la vez (una por visita),
--    cada una cubriendo un subconjunto de líneas del pedido.
drop index if exists public.ux_installation_order_active;

create table if not exists public.installation_line (
  id bigint generated always as identity primary key,
  installation_id bigint not null references public.installation(id) on delete cascade,
  sales_order_line_id bigint not null references public.sales_order_line(id),
  created_at timestamptz not null default now(),
  unique (installation_id, sales_order_line_id)
);

alter table public.installation_line enable row level security;
drop policy if exists installation_line_company_access on public.installation_line;
create policy installation_line_company_access on public.installation_line for all
  using (exists(select 1 from public.installation i where i.id = installation_id and i.company_id = public.current_company_id()))
  with check (exists(select 1 from public.installation i where i.id = installation_id and i.company_id = public.current_company_id()));

-- Una línea no puede quedar cubierta por dos instalaciones activas (no canceladas) a
-- la vez, sea cual sea el camino por el que se inserte la fila.
create or replace function public.check_installation_line_not_double_booked()
returns trigger
language plpgsql
as $$
declare
  v_status varchar;
  v_existing bigint;
begin
  select status into v_status from public.installation where id = new.installation_id;
  if v_status = 'CANCELLED' then
    raise exception 'No se pueden añadir líneas a una instalación cancelada';
  end if;
  select il.installation_id into v_existing
    from public.installation_line il
    join public.installation i on i.id = il.installation_id
   where il.sales_order_line_id = new.sales_order_line_id
     and i.status <> 'CANCELLED'
     and il.installation_id <> new.installation_id
   limit 1;
  if v_existing is not null then
    raise exception 'Esa línea ya está cubierta por otra instalación activa (%)', v_existing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_installation_line_double_booking on public.installation_line;
create trigger trg_check_installation_line_double_booking
before insert on public.installation_line
for each row execute function public.check_installation_line_not_double_booked();

-- Permite programar una nueva visita mientras el pedido ya tiene un montaje parcial
-- en curso (antes solo se permitía en MANUFACTURED/INSTALLED).
create or replace function public.check_installation_order_manufactured()
returns trigger
language plpgsql
as $$
declare
  v_status varchar;
begin
  select status into v_status from public.sales_order where id = new.sales_order_id;
  if v_status is null then
    raise exception 'El pedido de la instalación no existe';
  end if;
  if v_status not in ('MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED') then
    raise exception 'El pedido debe estar fabricado antes de programar el montaje';
  end if;
  return new;
end;
$$;

-- 3) Cuánto se ha entregado ya de cada línea del pedido (mismo patrón que
--    quotation_conversion_status para presupuesto→pedido, aplicado ahora a
--    pedido→albarán).
create or replace function public.sales_order_delivery_status(p_sales_order_id bigint)
returns table(
  sales_order_line_id bigint,
  line_no integer,
  product_id bigint,
  is_otd boolean,
  quantity numeric,
  delivered_quantity numeric,
  remaining_quantity numeric
)
language sql
security invoker
as $$
  select
    sol.id,
    sol.line_no,
    sol.product_id,
    sol.product_id is null,
    sol.quantity,
    coalesce(d.delivered, 0),
    sol.quantity - coalesce(d.delivered, 0)
  from public.sales_order_line sol
  left join (
    select dnl.sales_order_line_id, sum(dnl.quantity) as delivered
    from public.delivery_note_line dnl
    join public.delivery_note dn on dn.id = dnl.delivery_note_id and dn.deleted_at is null
    group by dnl.sales_order_line_id
  ) d on d.sales_order_line_id = sol.id
  where sol.sales_order_id = p_sales_order_id
  order by sol.line_no;
$$;
grant execute on function public.sales_order_delivery_status(bigint) to authenticated;

-- 4) Generaliza la creación de albarán: recibe explícitamente qué líneas y qué
--    cantidad de cada una se entregan (en vez de copiar el pedido entero). Sustituye
--    a create_delivery_note_from_sales_order de la migración anterior.
drop function if exists public.create_delivery_note_from_sales_order(bigint, bigint, date, text, text, text);

create or replace function public.create_delivery_note_for_lines(
  p_sales_order_id bigint,
  p_installation_id bigint,
  p_lines jsonb,
  p_delivery_date date default null,
  p_carrier text default null,
  p_tracking_number text default null,
  p_notes text default null
) returns bigint
language plpgsql
security invoker
as $$
declare
  o record;
  v_id bigint;
  v_code varchar;
  v_line jsonb;
  v_sol record;
  v_remaining numeric;
  v_qty numeric;
  v_net numeric := 0;
  v_total numeric := 0;
  v_line_net numeric;
  v_line_total numeric;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'No hay líneas que entregar';
  end if;

  select * into o from public.sales_order where id = p_sales_order_id;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  v_code := public.generate_delivery_note_code(o.company_id);

  insert into public.delivery_note (
    company_id, code, sales_order_id, installation_id, customer_id, delivery_date, carrier, tracking_number,
    delivery_address_street, delivery_address_city, delivery_address_postal_code, delivery_address_region,
    status, notes, net_amount, tax_amount, total_amount
  ) values (
    o.company_id, v_code, o.id, p_installation_id, o.customer_id, p_delivery_date, p_carrier, p_tracking_number,
    coalesce(o.installation_address_street, o.billing_address_street),
    coalesce(o.installation_address_city, o.billing_address_city),
    coalesce(o.installation_address_postal_code, o.billing_address_postal_code),
    coalesce(o.installation_address_region, o.billing_address_region),
    'PREPARED', p_notes, 0, 0, 0
  ) returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_sol from public.sales_order_line
      where id = (v_line->>'sales_order_line_id')::bigint and sales_order_id = p_sales_order_id;
    if not found then
      raise exception 'La línea % no pertenece a este pedido', v_line->>'sales_order_line_id';
    end if;

    v_qty := (v_line->>'quantity')::numeric;
    if v_qty <= 0 then
      raise exception 'La cantidad a entregar debe ser mayor que 0';
    end if;

    select v_sol.quantity - coalesce(sum(dnl.quantity), 0) into v_remaining
      from public.delivery_note_line dnl
      join public.delivery_note dn on dn.id = dnl.delivery_note_id and dn.deleted_at is null
     where dnl.sales_order_line_id = v_sol.id;
    v_remaining := coalesce(v_remaining, v_sol.quantity);
    if v_qty > v_remaining then
      raise exception 'La línea % solo tiene % unidades pendientes de entregar', v_sol.line_no, v_remaining;
    end if;

    v_line_net := round(v_sol.net_amount * v_qty / nullif(v_sol.quantity, 0), 2);
    v_line_total := round(v_sol.total_amount * v_qty / nullif(v_sol.quantity, 0), 2);

    insert into public.delivery_note_line (
      delivery_note_id, sales_order_line_id, line_no, product_id, description, quantity, unit_price,
      discount_percent, net_amount, total_amount, specific_data
    ) values (
      v_id, v_sol.id, v_sol.line_no, v_sol.product_id, v_sol.description, v_qty, v_sol.unit_price,
      v_sol.discount_percent, coalesce(v_line_net, 0), coalesce(v_line_total, 0), coalesce(v_sol.specific_data, '{}'::jsonb)
    );

    v_net := v_net + coalesce(v_line_net, 0);
    v_total := v_total + coalesce(v_line_total, 0);
  end loop;

  update public.delivery_note set net_amount = v_net, tax_amount = v_total - v_net, total_amount = v_total where id = v_id;

  return v_id;
end;
$$;
grant execute on function public.create_delivery_note_for_lines(bigint, bigint, jsonb, date, text, text, text) to authenticated;

-- 5) Al completar una instalación, el albarán se genera SOLO con las líneas que esa
--    instalación cubre (installation_line), no con todo el pedido. El pedido pasa a
--    INSTALLED únicamente cuando ya no queda ninguna línea pendiente de entrega
--    (ni de montaje ni de entrega manual de artículo simple).
--    Postgres no permite cambiar el tipo de retorno con create or replace (antes
--    devolvía void); hay que borrar la función anterior primero.
drop function if exists public.complete_installation(bigint, varchar, varchar);

create or replace function public.complete_installation(
  p_installation_id bigint,
  p_end_time varchar,
  p_actual_duration varchar
)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_order_id bigint;
  v_lines jsonb;
  v_delivery_note_id bigint;
  v_all_delivered boolean;
begin
  if p_end_time is null or trim(p_end_time) = '' or trim(p_end_time) = '00:00' then
    raise exception 'Debe indicar la hora de finalización';
  end if;
  if p_actual_duration is null or trim(p_actual_duration) = '' or trim(p_actual_duration) = '0' then
    raise exception 'Debe indicar la duración real';
  end if;

  update public.installation
     set status = 'COMPLETED', end_time = p_end_time, actual_duration = p_actual_duration, updated_at = now()
   where id = p_installation_id and status = 'SCHEDULED'
   returning sales_order_id into v_order_id;

  if v_order_id is null then
    raise exception 'La instalación no existe o ya no está programada';
  end if;

  select jsonb_agg(jsonb_build_object('sales_order_line_id', il.sales_order_line_id, 'quantity', sol.quantity))
    into v_lines
    from public.installation_line il
    join public.sales_order_line sol on sol.id = il.sales_order_line_id
   where il.installation_id = p_installation_id;

  if v_lines is not null and jsonb_array_length(v_lines) > 0 then
    v_delivery_note_id := public.create_delivery_note_for_lines(
      v_order_id, p_installation_id, v_lines, current_date, null, null, 'Generado al completar el montaje'
    );
  end if;

  select not exists(
    select 1 from public.sales_order_delivery_status(v_order_id) s where s.remaining_quantity > 0
  ) into v_all_delivered;

  update public.sales_order
     set status = case when v_all_delivered then 'INSTALLED' else 'INSTALLATION_SCHEDULED' end,
         updated_at = now()
   where id = v_order_id and status <> 'CANCELLED';

  return v_delivery_note_id;
end;
$$;

grant execute on function public.complete_installation(bigint, varchar, varchar) to authenticated;

-- 6) Entrega parcial de una línea de artículo simple (no OTD): registra el
--    movimiento de almacén (si el artículo lleva control de stock) y genera un
--    albarán solo con esa cantidad. Las líneas OTD no pasan por aquí — se entregan
--    enteras desde el montaje que las cubra.
create or replace function public.register_line_delivery(
  p_sales_order_line_id bigint,
  p_quantity numeric,
  p_notes text default null
) returns bigint
language plpgsql
security invoker
as $$
declare
  sol record;
  so record;
  v_product record;
  v_delivery_note_id bigint;
  v_lines jsonb;
begin
  select * into sol from public.sales_order_line where id = p_sales_order_line_id;
  if not found then
    raise exception 'Línea de pedido no encontrada';
  end if;
  select * into so from public.sales_order where id = sol.sales_order_id;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if so.status not in ('MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED') then
    raise exception 'El pedido debe estar fabricado antes de registrar una entrega';
  end if;
  if sol.product_id is null then
    raise exception 'Esta línea es de configuración OTD: se entrega completa desde su montaje, no por cantidad';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que 0';
  end if;

  select * into v_product from public.product where id = sol.product_id;
  if found and v_product.stock_enabled then
    perform public.register_stock_movement(
      so.company_id, so.warehouse_id, sol.product_id, p_quantity, 'DELIVERY',
      null, so.code, coalesce(p_notes, 'Entrega a cliente'), now(), null, null
    );
  end if;

  v_lines := jsonb_build_array(jsonb_build_object('sales_order_line_id', sol.id, 'quantity', p_quantity));
  v_delivery_note_id := public.create_delivery_note_for_lines(so.id, null, v_lines, current_date, null, null, p_notes);

  -- Si esta entrega era lo último que faltaba de un pedido que ya tenía montaje en
  -- curso (mixto: líneas OTD instaladas + líneas simples entregadas aparte), cierra
  -- el pedido como Instalado. Un pedido solo de artículos simples se queda en
  -- Fabricado — nunca tuvo montaje, así que "Instalado" no aplica.
  update public.sales_order
     set status = 'INSTALLED', updated_at = now()
   where id = so.id and status = 'INSTALLATION_SCHEDULED'
     and not exists (select 1 from public.sales_order_delivery_status(so.id) s where s.remaining_quantity > 0);

  return v_delivery_note_id;
end;
$$;
grant execute on function public.register_line_delivery(bigint, numeric, text) to authenticated;
