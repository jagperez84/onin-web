-- create_invoice_from_sales_order() leía payment_term_installment en vivo, en el
-- momento de generar la factura — no una copia de lo que había cuando se aceptó el
-- presupuesto/se creó el pedido. payment_term es una plantilla compartida por
-- muchos pedidos (p.ej. "30% al confirmar / 70% a la entrega"): si alguien la edita
-- (updatePaymentTerm) para corregirla o para un cliente nuevo, cualquier pedido ya
-- aceptado bajo los porcentajes antiguos — a veces meses antes, mientras se fabrica
-- e instala — se factura con los porcentajes NUEVOS en cuanto se genera la factura,
-- sin que el cliente haya aceptado ese cambio.
--
-- Se congela una copia de los tramos de la condición de pago en el momento de crear
-- el pedido (create_sales_order_from_quotation, el momento en que el presupuesto
-- aceptado se convierte en compromiso firme) y create_invoice_from_sales_order pasa
-- a usar esa copia. payment_term_id se mantiene igual (para mostrar el nombre de la
-- condición de pago), pero ya no se re-lee payment_term_installment al facturar.
--
-- Los pedidos ya existentes (creados antes de esta migración) no tienen snapshot:
-- create_invoice_from_sales_order cae al comportamiento anterior (leer en vivo) solo
-- para esos, así no cambia nada para facturas que ya se iban a generar con el
-- comportamiento de siempre.
alter table public.sales_order add column if not exists payment_term_installments_snapshot jsonb;
comment on column public.sales_order.payment_term_installments_snapshot is
  'Copia congelada de payment_term_installment en el momento de crear el pedido. create_invoice_from_sales_order factura con esto, no con el estado actual de payment_term_installment, para que editar la condición de pago compartida no afecte retroactivamente a pedidos ya aceptados.';

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
  v_payment_term_snapshot jsonb;
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

  if q.payment_term_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'sequence', pti.sequence,
             'percentage', pti.percentage,
             'days_offset', pti.days_offset,
             'description', pti.description
           ) order by pti.sequence), '[]'::jsonb)
      into v_payment_term_snapshot
      from public.payment_term_installment pti
      where pti.payment_term_id = q.payment_term_id;
  end if;

  insert into public.sales_order (
    company_id, quotation_id, customer_id, code, issue_date, requested_delivery_date, status,
    reference, notes, net_amount, discount_amount, tax_amount, total_amount,
    billing_address_street, billing_address_city, billing_address_postal_code, billing_address_region,
    installation_address_street, installation_address_city, installation_address_postal_code, installation_address_region,
    contact_id, contact_name, contact_email, contact_phone,
    commercial_id, warehouse_id, payment_method_id, payment_term_id, payment_term_installments_snapshot, measurement_id, requires_installation, created_by
  ) values (
    q.company_id, q.id, q.customer_id, v_code, current_date, null, 'PENDING_MANUFACTURING',
    q.reference, q.notes, 0, 0, 0, 0,
    q.billing_address_street, q.billing_address_city, q.billing_address_postal_code, q.billing_address_region,
    q.installation_address_street, q.installation_address_city, q.installation_address_postal_code, q.installation_address_region,
    q.contact_id, q.contact_name, q.contact_email, q.contact_phone,
    q.commercial_id, q.warehouse_id, q.payment_method_id, q.payment_term_id, v_payment_term_snapshot, q.measurement_id, p_requires_installation, auth.uid()
  ) returning id into o_id;

  insert into public.sales_order_comment (sales_order_id, sales_order_line_id, text, is_public)
    select o_id, null, text, false
    from public.quotation_comment
    where quotation_id = p_quotation_id and quotation_line_id is null and is_public = false;

  for item in select * from jsonb_array_elements(p_lines)
  loop
    -- FOR UPDATE: bloquea la línea de presupuesto mientras se calcula y consume su remanente.
    select * into l from public.quotation_line
      where id = (item->>'quotation_line_id')::bigint and quotation_id = p_quotation_id
      for update;
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

create or replace function public.create_invoice_from_sales_order(p_sales_order_id bigint) returns bigint
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  o record;
  co record;
  cust_tax_id text;
  l record;
  pt record;
  v_pt_json jsonb;
  i_id bigint;
  v_code varchar;
  v_line_no integer := 0;
  v_installment_count integer := 0;
  v_amount numeric;
  v_last_installment_id bigint;
  v_sum numeric;
  v_prev_hash text;
  v_chain_seq bigint;
  v_hash text;
  v_issuer_address text;
begin
  select * into o from public.sales_order where id = p_sales_order_id;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if o.status not in ('MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED', 'INVOICED') then
    raise exception 'El pedido debe estar fabricado antes de generar la factura';
  end if;

  if exists(select 1 from public.invoice where sales_order_id = p_sales_order_id and status = 'ISSUED' and invoice_type = 'ORIGINAL') then
    select id into i_id from public.invoice where sales_order_id = p_sales_order_id and status = 'ISSUED' and invoice_type = 'ORIGINAL' order by id desc limit 1;
    return i_id;
  end if;

  select * into co from public.company where id = o.company_id;
  select p.tax_id into cust_tax_id from public.customer c join public.party p on p.id = c.party_id where c.id = o.customer_id;

  v_issuer_address := nullif(trim(concat_ws(', ', co.street, co.postal_code, co.city, co.region)), '');
  v_code := public.generate_invoice_code(o.company_id);

  select record_hash, chain_sequence into v_prev_hash, v_chain_seq from public.invoice where company_id = o.company_id order by chain_sequence desc nulls last limit 1;
  v_chain_seq := coalesce(v_chain_seq, 0) + 1;
  v_hash := encode(digest(concat_ws('|', o.company_id::text, v_code, current_date::text, o.total_amount::text, coalesce(v_prev_hash, 'GENESIS')), 'sha256'), 'hex');

  insert into public.invoice (
    company_id, sales_order_id, customer_id, code, issue_date, status, reference, notes,
    payment_method_id, payment_term_id,
    billing_address_street, billing_address_city, billing_address_postal_code, billing_address_region,
    net_amount, discount_amount, tax_amount, total_amount,
    series, invoice_type, issuer_tax_id, issuer_legal_name, issuer_address, customer_tax_id,
    chain_sequence, previous_hash, record_hash, created_by
  ) values (
    o.company_id, o.id, o.customer_id, v_code, current_date, 'ISSUED', o.reference, o.notes,
    o.payment_method_id, o.payment_term_id,
    o.billing_address_street, o.billing_address_city, o.billing_address_postal_code, o.billing_address_region,
    o.net_amount, o.discount_amount, o.tax_amount, o.total_amount,
    'FRA', 'ORIGINAL', co.tax_id, co.name, v_issuer_address, cust_tax_id,
    v_chain_seq, v_prev_hash, v_hash, auth.uid()
  ) returning id into i_id;

  for l in select * from public.sales_order_line where sales_order_id = p_sales_order_id order by line_no loop
    v_line_no := v_line_no + 1;
    insert into public.invoice_line (
      invoice_id, sales_order_line_id, line_no, product_id, description, quantity, unit_price,
      discount_percent, tax_percent, net_amount, tax_amount, total_amount
    ) values (
      i_id, l.id, v_line_no, l.product_id, l.description, l.quantity, l.unit_price,
      l.discount_percent, l.tax_percent, l.net_amount, l.tax_amount, l.total_amount
    );
  end loop;

  insert into public.invoice_tax_breakdown (invoice_id, tax_percent, base_amount, tax_amount)
    select i_id, tax_percent, sum(net_amount), sum(tax_amount)
    from public.sales_order_line where sales_order_id = p_sales_order_id
    group by tax_percent;

  if o.payment_term_installments_snapshot is not null and jsonb_array_length(o.payment_term_installments_snapshot) > 0 then
    -- Pedido con snapshot propio (creado con esta migración ya aplicada): factura con
    -- los tramos tal y como estaban cuando se aceptó, no con lo que tenga ahora
    -- payment_term_installment.
    v_installment_count := jsonb_array_length(o.payment_term_installments_snapshot);
    for v_pt_json in select value from jsonb_array_elements(o.payment_term_installments_snapshot) order by (value->>'sequence')::int loop
      v_amount := round(o.total_amount * (v_pt_json->>'percentage')::numeric / 100, 2);
      insert into public.invoice_installment (invoice_id, sequence, percentage, due_date, amount)
      values (i_id, (v_pt_json->>'sequence')::int, (v_pt_json->>'percentage')::numeric, current_date + (v_pt_json->>'days_offset')::int, v_amount)
      returning id into v_last_installment_id;
    end loop;
  elsif o.payment_term_id is not null then
    -- Pedido sin snapshot (creado antes de esta migración): mantiene el comportamiento
    -- anterior, lee la condición de pago tal como esté en ese momento.
    select count(*) into v_installment_count from public.payment_term_installment where payment_term_id = o.payment_term_id;
    if v_installment_count > 0 then
      for pt in select * from public.payment_term_installment where payment_term_id = o.payment_term_id order by sequence loop
        v_amount := round(o.total_amount * pt.percentage / 100, 2);
        insert into public.invoice_installment (invoice_id, sequence, percentage, due_date, amount)
        values (i_id, pt.sequence, pt.percentage, current_date + pt.days_offset, v_amount)
        returning id into v_last_installment_id;
      end loop;
    end if;
  end if;

  if v_installment_count > 0 then
    select coalesce(sum(amount), 0) into v_sum from public.invoice_installment where invoice_id = i_id;
    update public.invoice_installment set amount = amount + (o.total_amount - v_sum) where id = v_last_installment_id;
  else
    insert into public.invoice_installment (invoice_id, sequence, percentage, due_date, amount)
    values (i_id, 1, 100, current_date, o.total_amount);
  end if;

  update public.sales_order set status = 'INVOICED', updated_at = now() where id = o.id;

  return i_id;
end;
$$;
