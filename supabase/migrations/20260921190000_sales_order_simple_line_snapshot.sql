-- Bug: en una línea de artículo simple (no OTD) del presupuesto, las dimensiones y la
-- característica/color viven en las tablas normalizadas quotation_line_dimension /
-- quotation_line_characteristic, no en quotation_line.specific_data. Al crear el pedido,
-- create_sales_order_from_quotation copiaba specific_data tal cual (sin esas dimensiones)
-- a sales_order_line.specific_data — que es lo único que leen deriveProfileCutNeeds,
-- resolveLonaConfectionComponents y resolveOrderLineComponents (despiece, corte de perfil,
-- confección de lona y consumo de componentes del pedido). Resultado: para una línea simple
-- con un perfil o una lona, el pedido llegaba con longitud/medidas a 0 y la confección de
-- lona ni siquiera arrancaba ("La línea de pedido no tiene un snapshot OTD disponible"),
-- porque no había snapshot en absoluto.
--
-- Se sintetiza aquí, al convertir, un configuration_snapshot equivalente al que ya genera
-- el configurador OTD (mismo shape que ya interpretan esas pantallas: dimensions a nivel
-- de snapshot — ya lo esperaba SalesOrderDeliveryNoteModal para líneas simples — y un único
-- components[0] con el propio artículo de la línea), sin tocar las líneas que ya son OTD
-- (que conservan su configuration_snapshot/otd_snapshot real). También se rellena hacia
-- atrás en los pedidos ya creados que se quedaron sin él.

create or replace function public.build_simple_line_configuration_snapshot(
  p_quotation_line_id bigint,
  p_product_id bigint
) returns jsonb
language plpgsql
security invoker
stable
as $$
declare
  v_dimensions jsonb;
  v_char_attribute_id bigint;
  v_char_code text;
  v_char_name text;
  v_color_id bigint;
  v_color_code text;
  v_color_name text;
  v_color_hex text;
  v_product_code text;
  v_product_commercial text;
  v_product_technical text;
begin
  if p_quotation_line_id is null or p_product_id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'code', qld.code,
           'name', qld.name,
           'value', qld.value,
           'unit_id', qld.unit_id,
           'unit_code', u.code,
           'unit_symbol', coalesce(u.symbol, u.code)
         ) order by qld.sort_order), '[]'::jsonb)
    into v_dimensions
    from public.quotation_line_dimension qld
    left join public.unit u on u.id = qld.unit_id
   where qld.quotation_line_id = p_quotation_line_id;

  select qlc.attribute_id, pa.code, pa.name, qlc.color_id, col.code, col.name, col.hex
    into v_char_attribute_id, v_char_code, v_char_name, v_color_id, v_color_code, v_color_name, v_color_hex
    from public.quotation_line_characteristic qlc
    left join public.product_attribute pa on pa.id = qlc.attribute_id
    left join public.color col on col.id = qlc.color_id
   where qlc.quotation_line_id = p_quotation_line_id and qlc.color_id is not null
   limit 1;

  select p.code, p.commercial_description, p.technical_description
    into v_product_code, v_product_commercial, v_product_technical
    from public.product p where p.id = p_product_id;

  return jsonb_build_object(
    'dimensions', v_dimensions,
    'characteristic_id', v_char_attribute_id,
    'characteristic_code', v_char_code,
    'characteristic_name', v_char_name,
    'color_id', v_color_id,
    'color_code', v_color_code,
    'color_name', v_color_name,
    'color_hex', v_color_hex,
    'components', jsonb_build_array(jsonb_build_object(
      'product_id', p_product_id,
      'product_code', v_product_code,
      'product_name', coalesce(v_product_commercial, v_product_technical, v_product_code),
      'characteristic_id', v_char_attribute_id,
      'characteristic_code', v_char_code,
      'characteristic_name', v_char_name,
      'color_id', v_color_id,
      'color_code', v_color_code,
      'color_name', v_color_name,
      'color_hex', v_color_hex,
      'quantity', 1,
      'dimension_list', v_dimensions
    ))
  );
end;
$$;

create or replace function public.create_sales_order_from_quotation(p_quotation_id bigint, p_lines jsonb)
returns bigint
language plpgsql
security invoker
as $$
declare
  q record;
  l record;
  item jsonb;
  o_id bigint;
  new_line_id bigint;
  v_code varchar;
  v_qty numeric;
  v_remaining numeric;
  v_ratio numeric;
  v_line_no integer := 0;
  v_net numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_specific_data jsonb;
  v_snapshot jsonb;
begin
  select * into q from public.quotation where id = p_quotation_id;
  if not found then
    raise exception 'Presupuesto no encontrado';
  end if;
  if q.status <> 'ACCEPTED' then
    raise exception 'Solo se puede crear un pedido desde un presupuesto aceptado';
  end if;
  if q.customer_id is null then
    raise exception 'El presupuesto debe tener cliente antes de crear el pedido';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Selecciona al menos una línea para crear el pedido';
  end if;

  v_code := public.generate_sales_order_code(q.company_id);

  insert into public.sales_order (
    company_id, quotation_id, customer_id, code, issue_date, requested_delivery_date, status,
    reference, notes, net_amount, discount_amount, tax_amount, total_amount,
    billing_address_street, billing_address_city, billing_address_postal_code, billing_address_region,
    installation_address_street, installation_address_city, installation_address_postal_code, installation_address_region,
    contact_id, contact_name, contact_email, contact_phone,
    commercial_id, warehouse_id, payment_method_id, payment_term_id, measurement_id, created_by
  ) values (
    q.company_id, q.id, q.customer_id, v_code, current_date, null, 'PENDING_MANUFACTURING',
    q.reference, q.notes, 0, 0, 0, 0,
    q.billing_address_street, q.billing_address_city, q.billing_address_postal_code, q.billing_address_region,
    q.installation_address_street, q.installation_address_city, q.installation_address_postal_code, q.installation_address_region,
    q.contact_id, q.contact_name, q.contact_email, q.contact_phone,
    q.commercial_id, q.warehouse_id, q.payment_method_id, q.payment_term_id, q.measurement_id, auth.uid()
  ) returning id into o_id;

  insert into public.sales_order_comment (sales_order_id, sales_order_line_id, text, is_public)
    select o_id, null, text, false
    from public.quotation_comment
    where quotation_id = p_quotation_id and quotation_line_id is null and is_public = false;

  for item in select * from jsonb_array_elements(p_lines)
  loop
    select * into l from public.quotation_line
      where id = (item->>'quotation_line_id')::bigint and quotation_id = p_quotation_id;
    if not found then
      raise exception 'Línea de presupuesto no válida';
    end if;

    v_qty := (item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad no válida para la línea %', l.line_no;
    end if;

    select l.quantity - coalesce(sum(sol.quantity) filter (where so.status <> 'CANCELLED'), 0)
      into v_remaining
      from public.sales_order_line sol
      join public.sales_order so on so.id = sol.sales_order_id
      where sol.quotation_line_id = l.id;
    v_remaining := coalesce(v_remaining, l.quantity);

    if v_qty > v_remaining then
      raise exception 'La cantidad solicitada para la línea % supera lo disponible (% de %)', l.line_no, v_remaining, l.quantity;
    end if;

    v_ratio := v_qty / l.quantity;
    v_line_no := v_line_no + 1;

    v_specific_data := coalesce(l.specific_data, '{}'::jsonb);

    -- Solo para líneas de artículo simple (con producto propio y sin snapshot OTD ya
    -- embebido): se sintetiza un configuration_snapshot con las dimensiones y la
    -- característica/color reales de la línea.
    if l.product_id is not null
       and not ((v_specific_data ? 'configuration_snapshot') or (v_specific_data ? 'otd_snapshot'))
    then
      v_snapshot := public.build_simple_line_configuration_snapshot(l.id, l.product_id);
      if v_snapshot is not null then
        v_specific_data := v_specific_data || jsonb_build_object('configuration_snapshot', v_snapshot);
      end if;
    end if;

    insert into public.sales_order_line (
      sales_order_id, quotation_line_id, line_no, product_id, description, quantity,
      unit_price, discount_percent, tax_percent, net_amount, tax_amount, total_amount, specific_data
    ) values (
      o_id, l.id, v_line_no, l.product_id, l.description, v_qty,
      l.unit_price, l.discount_percent, l.tax_percent,
      round(l.net_amount * v_ratio, 2), round(l.tax_amount * v_ratio, 2), round(l.total_amount * v_ratio, 2),
      v_specific_data
    ) returning id into new_line_id;

    insert into public.sales_order_comment (sales_order_id, sales_order_line_id, text, is_public)
      select o_id, new_line_id, text, false
      from public.quotation_comment
      where quotation_line_id = l.id and is_public = false;

    v_net := v_net + round(l.net_amount * v_ratio, 2);
    v_tax := v_tax + round(l.tax_amount * v_ratio, 2);
    v_total := v_total + round(l.total_amount * v_ratio, 2);
  end loop;

  update public.sales_order set net_amount = v_net, tax_amount = v_tax, total_amount = v_total
    where id = o_id;

  return o_id;
end;
$$;

grant execute on function public.create_sales_order_from_quotation(bigint, jsonb) to authenticated;

-- Rellena hacia atrás los pedidos ya creados cuyas líneas de artículo simple se quedaron
-- sin snapshot (idempotente: solo toca las que aún no tienen configuration_snapshot/otd_snapshot).
update public.sales_order_line sol
set specific_data = coalesce(sol.specific_data, '{}'::jsonb)
  || jsonb_build_object('configuration_snapshot', public.build_simple_line_configuration_snapshot(sol.quotation_line_id, sol.product_id))
where sol.quotation_line_id is not null
  and sol.product_id is not null
  and public.build_simple_line_configuration_snapshot(sol.quotation_line_id, sol.product_id) is not null
  and not (
    (coalesce(sol.specific_data, '{}'::jsonb) ? 'configuration_snapshot')
    or (coalesce(sol.specific_data, '{}'::jsonb) ? 'otd_snapshot')
  );

-- Igual para los albaranes ya emitidos de esas líneas (specific_data es una copia congelada
-- en el momento de crear el albarán, así que el backfill de sales_order_line no los alcanza).
update public.delivery_note_line dnl
set specific_data = coalesce(dnl.specific_data, '{}'::jsonb) || jsonb_build_object('configuration_snapshot', sol.specific_data->'configuration_snapshot')
from public.sales_order_line sol
where sol.id = dnl.sales_order_line_id
  and sol.specific_data ? 'configuration_snapshot'
  and not (
    (coalesce(dnl.specific_data, '{}'::jsonb) ? 'configuration_snapshot')
    or (coalesce(dnl.specific_data, '{}'::jsonb) ? 'otd_snapshot')
  );
