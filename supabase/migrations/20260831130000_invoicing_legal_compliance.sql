-- Facturación: cumplimiento legal español y preparación para Veri*Factu.
--
-- Esto NO es una implementación certificada de Veri*Factu (RD 1007/2023) —
-- eso exige, además de este esquema, conectar de verdad con el servicio web
-- de la AEAT usando el certificado digital de la empresa y validar el string
-- canónico del hash exactamente contra la especificación técnica oficial de
-- la Agencia Tributaria. Lo que sí resuelve esta migración:
--
--   1. Datos fiscales completos en cada factura: NIF del cliente y una foto
--      (nombre/NIF/domicilio) de la propia empresa emisora en el momento de
--      facturar, en vez de solo la dirección de envío.
--   2. Desglose de la cuota de IVA por tipo (invoice_tax_breakdown) — Hacienda
--      lo exige cuando una factura mezcla tipos distintos, y antes solo había
--      un importe agregado.
--   3. Encadenado de huella (hash) de cada factura con la anterior de la
--      empresa: previous_hash/record_hash/chain_sequence, con las columnas
--      de estado de envío (verifactu_status/response/qr) ya preparadas pero
--      sin usar hasta que se conecte la llamada real a la AEAT.
--   4. Inmutabilidad real: se retira la política de UPDATE abierta sobre
--      invoice (con ella, cualquiera podía cambiar el importe de una factura
--      ya emitida vía API). Las únicas mutaciones posibles a partir de ahora
--      son a través de funciones security definer con comprobación de
--      empresa explícita — deliberadamente distinto del resto de funciones
--      de este proyecto (que son security invoker apoyadas en políticas de
--      UPDATE), precisamente porque aquí no debe existir ninguna política de
--      UPDATE abierta que permitiría alterar el contenido legal.
--   5. Facturas rectificativas de verdad en vez de "cancelar": anular una
--      factura ya emitida genera una nueva factura (serie FRA-R, importes en
--      negativo) enlazada a la original, que nunca se borra ni dejar de
--      poder consultarse — solo cambia su estado a RECTIFIED.

create extension if not exists pgcrypto with schema extensions;

-- Domicilio fiscal del emisor (no existía ninguna dirección de la propia
-- empresa en el esquema). Sin pantalla de edición todavía: de momento se
-- rellena a mano en Supabase.
alter table public.company add column if not exists street text;
alter table public.company add column if not exists postal_code text;
alter table public.company add column if not exists city text;
alter table public.company add column if not exists region text;

alter table public.invoice add column if not exists series varchar(10) not null default 'FRA';
alter table public.invoice add column if not exists invoice_type varchar(20) not null default 'ORIGINAL';
alter table public.invoice add column if not exists rectifies_invoice_id bigint references public.invoice(id);
alter table public.invoice add column if not exists rectified_by_invoice_id bigint references public.invoice(id);
alter table public.invoice add column if not exists rectification_reason text;
alter table public.invoice add column if not exists issuer_tax_id varchar(20);
alter table public.invoice add column if not exists issuer_legal_name text;
alter table public.invoice add column if not exists issuer_address text;
alter table public.invoice add column if not exists customer_tax_id varchar(20);
alter table public.invoice add column if not exists chain_sequence bigint;
alter table public.invoice add column if not exists previous_hash text;
alter table public.invoice add column if not exists record_hash text;
alter table public.invoice add column if not exists hash_algorithm varchar(20) not null default 'SHA-256';
alter table public.invoice add column if not exists verifactu_status varchar(20) not null default 'NOT_SENT';
alter table public.invoice add column if not exists verifactu_sent_at timestamptz;
alter table public.invoice add column if not exists verifactu_response jsonb;
alter table public.invoice add column if not exists verifactu_qr_payload text;

-- Por si ya existiera alguna factura CANCELLED de pruebas con el estado
-- anterior, antes de que el check constraint deje de permitirlo.
update public.invoice set status = 'RECTIFIED' where status = 'CANCELLED';
alter table public.invoice drop constraint if exists invoice_status_ck;
alter table public.invoice add constraint invoice_status_ck check (status in ('ISSUED', 'RECTIFIED'));
alter table public.invoice drop constraint if exists invoice_type_ck;
alter table public.invoice add constraint invoice_type_ck check (invoice_type in ('ORIGINAL', 'RECTIFICATIVA'));
alter table public.invoice drop constraint if exists invoice_verifactu_status_ck;
alter table public.invoice add constraint invoice_verifactu_status_ck check (verifactu_status in ('NOT_SENT', 'PENDING', 'SENT', 'ERROR'));

create unique index if not exists ux_invoice_chain_sequence on public.invoice (company_id, chain_sequence);

-- Solo un original activo (no rectificado) bloquea re-facturar el mismo
-- pedido; si se rectifica por completo, el pedido vuelve a quedar facturable.
drop index if exists ux_invoice_sales_order_active;
create unique index if not exists ux_invoice_sales_order_active
  on public.invoice (sales_order_id) where status = 'ISSUED' and invoice_type = 'ORIGINAL';

create table if not exists public.invoice_tax_breakdown (
  id bigint generated by default as identity primary key,
  invoice_id bigint not null references public.invoice(id) on delete cascade,
  tax_percent numeric(6, 3) not null,
  base_amount numeric(15, 2) not null,
  tax_amount numeric(15, 2) not null
);
create index if not exists ix_invoice_tax_breakdown_invoice on public.invoice_tax_breakdown (invoice_id);

alter table public.invoice_tax_breakdown enable row level security;
drop policy if exists invoice_tax_breakdown_company_select on public.invoice_tax_breakdown;
create policy invoice_tax_breakdown_company_select on public.invoice_tax_breakdown for select using (
  exists(select 1 from public.invoice i where i.id = invoice_id and i.company_id = (select company_id from public.user_account where auth_user_id = auth.uid()))
);
drop policy if exists invoice_tax_breakdown_company_insert on public.invoice_tax_breakdown;
create policy invoice_tax_breakdown_company_insert on public.invoice_tax_breakdown for insert with check (
  exists(select 1 from public.invoice i where i.id = invoice_id and i.company_id = (select company_id from public.user_account where auth_user_id = auth.uid()))
);

-- Inmutabilidad: sin política de UPDATE para el rol autenticado normal.
-- Las únicas mutaciones pasan por funciones security definer específicas.
drop policy if exists invoice_company_update on public.invoice;

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
  if o.status not in ('MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED') then
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

  return i_id;
end;
$$;

grant execute on function public.create_invoice_from_sales_order(bigint) to authenticated;

drop function if exists public.cancel_invoice(bigint);

-- security definer deliberado: invoice no tiene política de UPDATE para el
-- rol autenticado (inmutabilidad legal), así que la única forma de marcar el
-- original como rectificado es a través de esta función, que comprueba la
-- empresa a mano en vez de apoyarse en RLS.
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

  select * into orig from public.invoice where id = p_invoice_id;
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

-- security definer por el mismo motivo: aquí se registrará en el futuro la
-- respuesta real de la AEAT. Sin conexión real todavía — nada llama a esta
-- función hoy, solo deja preparado el punto de enganche.
create or replace function public.record_verifactu_submission(
  p_invoice_id bigint, p_status varchar, p_response jsonb, p_qr_payload text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_company bigint;
  v_invoice_company bigint;
begin
  select company_id into v_caller_company from public.user_account where auth_user_id = auth.uid();
  select company_id into v_invoice_company from public.invoice where id = p_invoice_id;
  if v_invoice_company is null or v_invoice_company <> v_caller_company then
    raise exception 'Factura no encontrada';
  end if;
  if p_status not in ('NOT_SENT', 'PENDING', 'SENT', 'ERROR') then
    raise exception 'Estado de envío no válido';
  end if;
  update public.invoice set
    verifactu_status = p_status,
    verifactu_response = p_response,
    verifactu_qr_payload = coalesce(p_qr_payload, verifactu_qr_payload),
    verifactu_sent_at = case when p_status = 'SENT' then now() else verifactu_sent_at end,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;

revoke execute on function public.record_verifactu_submission(bigint, varchar, jsonb, text) from public;
grant execute on function public.record_verifactu_submission(bigint, varchar, jsonb, text) to authenticated;
