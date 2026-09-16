-- create_rectifying_invoice() rectifica el importe legal de la factura (invoice/
-- invoice_line/invoice_tax_breakdown) pero no tocaba invoice_installment: si la
-- factura original tenía algún plazo todavía PENDING, ese plazo se quedaba
-- colgado como si siguiera siendo cobrable después de rectificar (anular) la
-- factura entera. La pantalla de Cobros no filtra por el estado de la factura
-- (ver CollectionList.tsx/listCollections), así que ese plazo seguía apareciendo
-- en "Cobros pendientes" con el botón "Marcar cobrado" activo: se podía llegar a
-- registrar un cobro real sobre una factura que ya no es válida.
--
-- Los plazos ya COLLECTED no se tocan: son un hecho histórico (el dinero ya se
-- recibió) — decidir cómo se devuelve/compensa ese importe es una decisión de
-- negocio aparte, no algo que esta función deba inventar. invoice_installment es
-- información de gestión interna, no contenido legal de la factura (a diferencia
-- de invoice/invoice_line, no lleva hash-chain), así que borrar un plazo PENDING
-- que ya no aplica es seguro.
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

  -- Nada queda pendiente de cobrar de una factura que se acaba de anular.
  delete from public.invoice_installment where invoice_id = orig.id and status = 'PENDING';

  update public.invoice set status = 'RECTIFIED', rectified_by_invoice_id = r_id, updated_at = now() where id = orig.id;

  return r_id;
end;
$$;
revoke execute on function public.create_rectifying_invoice(bigint, text) from public;
grant execute on function public.create_rectifying_invoice(bigint, text) to authenticated;
