-- Los albaranes dejan de guardarse en localStorage del navegador (sin persistencia
-- real, sin RLS, sin multiempresa) para pasar a ser un documento más en Supabase,
-- igual que presupuesto/pedido/factura.
--
-- Además, dejan de generarse desde el PRESUPUESTO (antes quedaban enganchados a
-- quotation_id, sin saber si el pedido se había fabricado o instalado siquiera) y
-- pasan a generarse desde el PEDIDO — opcionalmente desde una instalación ya
-- completada, de forma que un pedido con montaje genera su albarán con las
-- cantidades realmente instaladas en vez de las presupuestadas. Un pedido sin
-- montaje (venta de mostrador/envío directo) sigue pudiendo generar su albarán
-- manualmente, sin instalación asociada.

create table if not exists public.delivery_note (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.company(id),
  code varchar not null,
  sales_order_id bigint not null references public.sales_order(id),
  installation_id bigint references public.installation(id),
  customer_id bigint not null references public.customer(id),
  issue_date date not null default current_date,
  delivery_date date,
  carrier text,
  tracking_number text,
  delivery_address_street text,
  delivery_address_city text,
  delivery_address_postal_code text,
  delivery_address_region text,
  status text not null default 'PREPARED' check (status in ('PENDING','PREPARED','SHIPPED','DELIVERED')),
  notes text,
  net_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  total_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  unique(company_id, code)
);

create table if not exists public.delivery_note_line (
  id bigint generated always as identity primary key,
  delivery_note_id bigint not null references public.delivery_note(id) on delete cascade,
  sales_order_line_id bigint references public.sales_order_line(id),
  line_no integer not null,
  product_id bigint references public.product(id),
  description text,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  discount_percent numeric not null default 0,
  net_amount numeric not null default 0,
  total_amount numeric not null default 0,
  specific_data jsonb not null default '{}'::jsonb
);

alter table public.delivery_note enable row level security;
drop policy if exists delivery_note_company_access on public.delivery_note;
create policy delivery_note_company_access on public.delivery_note for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

alter table public.delivery_note_line enable row level security;
drop policy if exists delivery_note_line_company_access on public.delivery_note_line;
create policy delivery_note_line_company_access on public.delivery_note_line for all
  using (exists(select 1 from public.delivery_note d where d.id = delivery_note_id and d.company_id = public.current_company_id()))
  with check (exists(select 1 from public.delivery_note d where d.id = delivery_note_id and d.company_id = public.current_company_id()));

-- Mismo patrón que generate_sales_order_code/generate_invoice_code: contador por
-- año y empresa a partir del máximo ya usado.
create or replace function public.generate_delivery_note_code(p_company_id bigint) returns varchar
language plpgsql as $$
declare y text := to_char(current_date, 'YYYY'); n integer;
begin
  select coalesce(max(nullif(regexp_replace(code, '^ALB-' || y || '/', ''), '')::integer), 0) + 1
    into n
    from public.delivery_note
    where company_id = p_company_id and code like 'ALB-' || y || '/%';
  return 'ALB-' || y || '/' || lpad(n::text, 3, '0');
end;
$$;
grant execute on function public.generate_delivery_note_code(bigint) to authenticated;

-- Genera el albarán a partir de un pedido, copiando sus líneas tal cual (cantidades
-- y datos del despiece/OTD incluidos). Si se pasa p_installation_id, queda
-- enlazado a esa instalación (para dejar constancia de que la entrega fue una
-- instalación in situ, no solo una expedición de almacén). Si el pedido ya tiene
-- un albarán activo, se devuelve el existente en vez de duplicarlo.
create or replace function public.create_delivery_note_from_sales_order(
  p_sales_order_id bigint,
  p_installation_id bigint default null,
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
  l record;
  v_id bigint;
  v_code varchar;
begin
  select * into o from public.sales_order where id = p_sales_order_id;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  select id into v_id from public.delivery_note where sales_order_id = p_sales_order_id and deleted_at is null limit 1;
  if v_id is not null then
    return v_id;
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
    'PREPARED', p_notes, o.net_amount, o.tax_amount, o.total_amount
  ) returning id into v_id;

  for l in select * from public.sales_order_line where sales_order_id = p_sales_order_id order by line_no loop
    insert into public.delivery_note_line (
      delivery_note_id, sales_order_line_id, line_no, product_id, description, quantity, unit_price,
      discount_percent, net_amount, total_amount, specific_data
    ) values (
      v_id, l.id, l.line_no, l.product_id, l.description, l.quantity, l.unit_price,
      l.discount_percent, l.net_amount, l.total_amount, coalesce(l.specific_data, '{}'::jsonb)
    );
  end loop;

  return v_id;
end;
$$;
grant execute on function public.create_delivery_note_from_sales_order(bigint, bigint, date, text, text, text) to authenticated;
