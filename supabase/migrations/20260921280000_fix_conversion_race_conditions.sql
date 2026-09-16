-- Tres condiciones de carrera detectadas en la auditoría: cada una hace un SELECT normal (sin
-- FOR UPDATE) sobre la fila cuyo remanente/estado decide si la operación se permite, y luego
-- actúa según ese remanente/estado. Dos llamadas concurrentes sobre la misma fila (dos pestañas,
-- dos comerciales, un reintento de red) pueden leer ambas el mismo valor antes de que ninguna
-- confirme, pasando ambas la validación:
--   1. create_sales_order_from_quotation: dos conversiones parciales del mismo presupuesto
--      pueden convertir en conjunto más cantidad de la presupuestada.
--   2. create_delivery_note_for_lines: mismo patrón, puede generar sobre-entrega.
--   3. create_rectifying_invoice: dos rectificaciones casi simultáneas de la misma factura
--      pueden generar dos facturas rectificativas; la segunda update pisa el
--      rectified_by_invoice_id que dejó la primera, perdiendo la trazabilidad de una de las dos.
-- Añadir FOR UPDATE a la fila que decide la validación serializa las llamadas concurrentes: la
-- segunda espera a que la primera confirme y entonces ve el estado ya actualizado.

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
grant execute on function public.create_sales_order_from_quotation(bigint, jsonb, boolean) to authenticated;

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
    status, notes, net_amount, tax_amount, total_amount, created_by
  ) values (
    o.company_id, v_code, o.id, p_installation_id, o.customer_id, p_delivery_date, p_carrier, p_tracking_number,
    coalesce(o.installation_address_street, o.billing_address_street),
    coalesce(o.installation_address_city, o.billing_address_city),
    coalesce(o.installation_address_postal_code, o.billing_address_postal_code),
    coalesce(o.installation_address_region, o.billing_address_region),
    'PREPARED', p_notes, 0, 0, 0, auth.uid()
  ) returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    -- FOR UPDATE: bloquea la línea de pedido mientras se calcula y consume lo pendiente de entregar.
    select * into v_sol from public.sales_order_line
      where id = (v_line->>'sales_order_line_id')::bigint and sales_order_id = p_sales_order_id
      for update;
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

create or replace function public.create_rectifying_invoice(p_invoice_id bigint, p_reason text) returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  orig record;
  l record;
  tb record;
  r_id bigint;
  v_code varchar;
  v_caller_company bigint;
  v_prev_hash text;
  v_chain_seq bigint;
  v_hash text;
begin
  select company_id into v_caller_company from public.user_account where auth_user_id = auth.uid();
  if v_caller_company is null then
    raise exception 'No hay un usuario autenticado con empresa asignada';
  end if;

  -- FOR UPDATE: una segunda llamada concurrente sobre la misma factura espera a que esta
  -- confirme y entonces ve status='RECTIFIED', en vez de leer 'ISSUED' en paralelo y generar
  -- dos rectificativas de la misma factura original.
  select * into orig from public.invoice where id = p_invoice_id for update;
  if not found or orig.company_id <> v_caller_company then
    raise exception 'Factura no encontrada';
  end if;
  if orig.status <> 'ISSUED' then
    raise exception 'La factura ya ha sido rectificada';
  end if;
  if p_reason is null or trim(p_reason) = '' then
    raise exception 'Indica el motivo de la rectificación';
  end if;

  v_code := public.generate_invoice_code(orig.company_id);
  select record_hash, chain_sequence into v_prev_hash, v_chain_seq from public.invoice where company_id = orig.company_id order by chain_sequence desc nulls last limit 1;
  v_chain_seq := coalesce(v_chain_seq, 0) + 1;
  v_hash := encode(digest(concat_ws('|', orig.company_id::text, v_code, current_date::text, (-orig.total_amount)::text, coalesce(v_prev_hash, 'GENESIS')), 'sha256'), 'hex');

  insert into public.invoice (
    company_id, sales_order_id, customer_id, code, issue_date, status, reference, notes,
    payment_method_id, payment_term_id,
    billing_address_street, billing_address_city, billing_address_postal_code, billing_address_region,
    net_amount, discount_amount, tax_amount, total_amount,
    series, invoice_type, rectifies_invoice_id, rectification_reason,
    issuer_tax_id, issuer_legal_name, issuer_address, customer_tax_id,
    chain_sequence, previous_hash, record_hash
  ) values (
    orig.company_id, orig.sales_order_id, orig.customer_id, v_code, current_date, 'ISSUED', orig.reference, p_reason,
    orig.payment_method_id, orig.payment_term_id,
    orig.billing_address_street, orig.billing_address_city, orig.billing_address_postal_code, orig.billing_address_region,
    -orig.net_amount, -orig.discount_amount, -orig.tax_amount, -orig.total_amount,
    'FRA-R', 'RECTIFICATIVA', orig.id, p_reason,
    orig.issuer_tax_id, orig.issuer_legal_name, orig.issuer_address, orig.customer_tax_id,
    v_chain_seq, v_prev_hash, v_hash
  ) returning id into r_id;

  for l in select * from public.invoice_line where invoice_id = orig.id order by line_no loop
    insert into public.invoice_line (
      invoice_id, sales_order_line_id, line_no, product_id, description, quantity, unit_price,
      discount_percent, tax_percent, net_amount, tax_amount, total_amount
    ) values (
      r_id, l.sales_order_line_id, l.line_no, l.product_id, l.description, -l.quantity, l.unit_price,
      l.discount_percent, l.tax_percent, -l.net_amount, -l.tax_amount, -l.total_amount
    );
  end loop;

  for tb in select * from public.invoice_tax_breakdown where invoice_id = orig.id loop
    insert into public.invoice_tax_breakdown (invoice_id, tax_percent, base_amount, tax_amount)
    values (r_id, tb.tax_percent, -tb.base_amount, -tb.tax_amount);
  end loop;

  insert into public.invoice_installment (invoice_id, sequence, percentage, due_date, amount)
  values (r_id, 1, 100, current_date, -orig.total_amount);

  update public.invoice set status = 'RECTIFIED', rectified_by_invoice_id = r_id, updated_at = now() where id = orig.id;

  return r_id;
end;
$$;
revoke execute on function public.create_rectifying_invoice(bigint, text) from public;
grant execute on function public.create_rectifying_invoice(bigint, text) to authenticated;
