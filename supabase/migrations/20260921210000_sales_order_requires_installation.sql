-- Un pedido con solo artículos simples no tiene por qué llevar montaje (el cliente lo recoge,
-- lo instala él mismo, es un accesorio que no requiere visita…), así que hace falta indicarlo
-- explícitamente en vez de asumir que todo pedido pasa por una fase de montaje. Se decide al
-- convertir el presupuesto en pedido (paso obligatorio en el cliente) y queda fijado en el
-- pedido; el resto de la ficha (stepper de ciclo de vida, sección de Montajes) deja de ofrecer
-- ese paso cuando no aplica.
--
-- Un pedido con algún artículo OTD/a medida SÍ necesita montaje siempre: hoy es la única vía
-- para generar su albarán de entrega (create_delivery_note_for_lines solo se dispara desde
-- complete_installation para esas líneas), así que el guardado impide desmarcarlo para no
-- dejar líneas sin forma de entregarse.

alter table public.sales_order add column if not exists requires_installation boolean;
update public.sales_order set requires_installation = true where requires_installation is null;
alter table public.sales_order alter column requires_installation set not null;
alter table public.sales_order alter column requires_installation set default true;

drop function if exists public.create_sales_order_from_quotation(bigint, jsonb);

create or replace function public.create_sales_order_from_quotation(
  p_quotation_id bigint,
  p_lines jsonb,
  p_requires_installation boolean default true
)
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
  if p_requires_installation is null then
    raise exception 'Indica si el pedido requiere montaje';
  end if;

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
    commercial_id, warehouse_id, payment_method_id, payment_term_id, measurement_id, requires_installation, created_by
  ) values (
    q.company_id, q.id, q.customer_id, v_code, current_date, null, 'PENDING_MANUFACTURING',
    q.reference, q.notes, 0, 0, 0, 0,
    q.billing_address_street, q.billing_address_city, q.billing_address_postal_code, q.billing_address_region,
    q.installation_address_street, q.installation_address_city, q.installation_address_postal_code, q.installation_address_region,
    q.contact_id, q.contact_name, q.contact_email, q.contact_phone,
    q.commercial_id, q.warehouse_id, q.payment_method_id, q.payment_term_id, q.measurement_id, p_requires_installation, auth.uid()
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

    if not p_requires_installation and l.product_id is null then
      raise exception 'La línea % es un artículo a medida (OTD) y necesita montaje: no se puede crear el pedido sin montaje', l.line_no;
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

grant execute on function public.create_sales_order_from_quotation(bigint, jsonb, boolean) to authenticated;
