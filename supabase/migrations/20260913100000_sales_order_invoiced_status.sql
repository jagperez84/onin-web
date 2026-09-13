-- Nuevo estado de pedido "INVOICED" (Facturado).
--
-- Generar la factura de un pedido no dejaba ningún rastro en su estado: un
-- pedido fabricado/instalado seguía mostrando MANUFACTURED/INSTALLED aunque
-- ya tuviera factura emitida. Se añade INVOICED como estado final del ciclo
-- de venta (MANUFACTURED/INSTALLATION_SCHEDULED/INSTALLED -> se genera la
-- factura -> INVOICED), que create_invoice_from_sales_order aplica al emitir
-- la factura original.
--
-- INVOICED no sustituye el seguimiento de montaje/entrega — sigue pudiendo
-- haber visitas de montaje pendientes o líneas por entregar en un pedido ya
-- facturado (facturar no depende de haber entregado todo, solo de estar
-- fabricado) — así que las funciones que tocan sales_order.status desde el
-- lado de montaje/entrega/fabricación se protegen para no revertir un pedido
-- ya facturado, y las que exigen "pedido fabricado" para actuar aceptan
-- también INVOICED.

alter table public.sales_order drop constraint if exists sales_order_status_ck;
alter table public.sales_order add constraint sales_order_status_ck
  check (status in ('PENDING_MANUFACTURING','PREPARED','FABRICATING','CONFECTIONED','MANUFACTURED','INSTALLATION_SCHEDULED','INSTALLED','INVOICED','CANCELLED'));

-- No debe poder retroceder un pedido ya facturado a MANUFACTURED.
create or replace function public.mark_sales_order_manufactured(p_sales_order_id bigint)
returns void
language plpgsql
security invoker
as $$
begin
  update public.sales_order
     set status = 'MANUFACTURED', updated_at = now()
   where id = p_sales_order_id
     and status not in ('MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED', 'INVOICED', 'CANCELLED');
end;
$$;

-- Debe poder seguir programándose/ampliándose un montaje aunque el pedido ya
-- esté facturado (facturar no implica que el montaje ha terminado).
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
  if v_status not in ('MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED', 'INVOICED') then
    raise exception 'El pedido debe estar fabricado antes de programar el montaje';
  end if;
  return new;
end;
$$;

-- Debe poder seguir registrándose la entrega de líneas simples aunque el
-- pedido ya esté facturado.
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
  if so.status not in ('MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED', 'INVOICED') then
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
  -- Fabricado — nunca tuvo montaje, así que "Instalado" no aplica. Si ya está
  -- facturado, se queda facturado.
  update public.sales_order
     set status = 'INSTALLED', updated_at = now()
   where id = so.id and status = 'INSTALLATION_SCHEDULED'
     and not exists (select 1 from public.sales_order_delivery_status(so.id) s where s.remaining_quantity > 0);

  return v_delivery_note_id;
end;
$$;

-- No debe revertir un pedido ya facturado a INSTALLED/INSTALLATION_SCHEDULED
-- al completar (otra) visita de montaje.
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
   where id = p_installation_id and status in ('SCHEDULED', 'IN_PROGRESS', 'BLOCKED')
   returning sales_order_id into v_order_id;

  if v_order_id is null then
    raise exception 'La instalación no existe o ya está cerrada';
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
   where id = v_order_id and status not in ('CANCELLED', 'INVOICED');

  return v_delivery_note_id;
end;
$$;

-- Marca el pedido como facturado al emitir la factura original, y permite
-- volver a generar una factura si la anterior ya no está ISSUED (p. ej. tras
-- una futura cancelación) aunque el pedido siga en INVOICED.
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
    chain_sequence, previous_hash, record_hash
  ) values (
    o.company_id, o.id, o.customer_id, v_code, current_date, 'ISSUED', o.reference, o.notes,
    o.payment_method_id, o.payment_term_id,
    o.billing_address_street, o.billing_address_city, o.billing_address_postal_code, o.billing_address_region,
    o.net_amount, o.discount_amount, o.tax_amount, o.total_amount,
    'FRA', 'ORIGINAL', co.tax_id, co.name, v_issuer_address, cust_tax_id,
    v_chain_seq, v_prev_hash, v_hash
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

  -- Plazos: derivados de la condición de pago del pedido; si no tiene, un
  -- único plazo del 100% con vencimiento en la propia fecha de emisión.
  if o.payment_term_id is not null then
    select count(*) into v_installment_count from public.payment_term_installment where payment_term_id = o.payment_term_id;
  end if;

  if v_installment_count > 0 then
    for pt in select * from public.payment_term_installment where payment_term_id = o.payment_term_id order by sequence loop
      v_amount := round(o.total_amount * pt.percentage / 100, 2);
      insert into public.invoice_installment (invoice_id, sequence, percentage, due_date, amount)
      values (i_id, pt.sequence, pt.percentage, current_date + pt.days_offset, v_amount)
      returning id into v_last_installment_id;
    end loop;
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
