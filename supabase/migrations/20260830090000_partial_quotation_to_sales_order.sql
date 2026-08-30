-- Allow converting a quotation into more than one sales order over time,
-- selecting which lines and how much quantity of each goes into each pedido.

alter table public.sales_order drop constraint if exists sales_order_quotation_uk;

drop function if exists public.create_sales_order_from_quotation(bigint);

create or replace function public.quotation_conversion_status(p_quotation_id bigint)
returns table(
  quotation_line_id bigint,
  line_no integer,
  quantity numeric,
  converted_quantity numeric,
  remaining_quantity numeric
)
language sql
security invoker
as $$
  select
    ql.id,
    ql.line_no,
    ql.quantity,
    coalesce(sum(sol.quantity) filter (where so.status <> 'CANCELLED'), 0) as converted_quantity,
    ql.quantity - coalesce(sum(sol.quantity) filter (where so.status <> 'CANCELLED'), 0) as remaining_quantity
  from public.quotation_line ql
  left join public.sales_order_line sol on sol.quotation_line_id = ql.id
  left join public.sales_order so on so.id = sol.sales_order_id
  where ql.quotation_id = p_quotation_id
  group by ql.id, ql.line_no, ql.quantity
  order by ql.line_no;
$$;

grant execute on function public.quotation_conversion_status(bigint) to authenticated;

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
  v_code varchar;
  v_qty numeric;
  v_remaining numeric;
  v_ratio numeric;
  v_line_no integer := 0;
  v_net numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
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
    commercial_id, warehouse_id, payment_method_id, payment_term_id, measurement_id
  ) values (
    q.company_id, q.id, q.customer_id, v_code, current_date, null, 'PENDING_MANUFACTURING',
    q.reference, q.notes, 0, 0, 0, 0,
    q.billing_address_street, q.billing_address_city, q.billing_address_postal_code, q.billing_address_region,
    q.installation_address_street, q.installation_address_city, q.installation_address_postal_code, q.installation_address_region,
    q.contact_id, q.contact_name, q.contact_email, q.contact_phone,
    q.commercial_id, q.warehouse_id, q.payment_method_id, q.payment_term_id, q.measurement_id
  ) returning id into o_id;

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

    insert into public.sales_order_line (
      sales_order_id, quotation_line_id, line_no, product_id, description, quantity,
      unit_price, discount_percent, tax_percent, net_amount, tax_amount, total_amount, specific_data
    ) values (
      o_id, l.id, v_line_no, l.product_id, l.description, v_qty,
      l.unit_price, l.discount_percent, l.tax_percent,
      round(l.net_amount * v_ratio, 2), round(l.tax_amount * v_ratio, 2), round(l.total_amount * v_ratio, 2),
      coalesce(l.specific_data, '{}'::jsonb)
    );

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
