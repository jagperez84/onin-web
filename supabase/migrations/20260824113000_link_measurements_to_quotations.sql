-- Link the existing measurement -> quotation workflow without forcing
-- a measurement or quotation to have a customer.
--
-- When a measurement reaches QUOTED (the existing "Generar presupuesto"
-- action), create one draft quotation carrying the measurement's
-- commercial/contact snapshot and installation address.

create or replace function public.generate_quotation_from_measurement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_quotation_id bigint;
  quotation_year integer;
  quotation_number bigint;
  quotation_code varchar;
begin
  if new.status <> 'QUOTED' or coalesce(old.status, '') = 'QUOTED' then
    return new;
  end if;

  select q.id
    into existing_quotation_id
    from public.quotation q
   where q.company_id = new.company_id
     and q.measurement_id = new.id
   order by q.id desc
   limit 1;

  if existing_quotation_id is not null then
    return new;
  end if;

  quotation_year := extract(year from current_date)::integer;

  select coalesce(max(q.number), 0) + 1
    into quotation_number
    from public.quotation q
   where q.company_id = new.company_id
     and q.year = quotation_year;

  quotation_code := quotation_year::text || '/' || quotation_number::text;

  insert into public.quotation (
    company_id,
    year,
    number,
    code,
    customer_id,
    commercial_id,
    warehouse_id,
    billing_address_id,
    installation_address_id,
    payment_method_id,
    payment_term_id,
    measurement_id,
    issue_date,
    valid_until,
    status,
    reference,
    notes,
    net_amount,
    discount_amount,
    tax_amount,
    total_amount,
    tax_rate_id,
    tax_percent,
    billing_address_label,
    billing_address_street,
    billing_address_postal_code,
    billing_address_city,
    billing_address_region,
    installation_address_label,
    installation_address_street,
    installation_address_postal_code,
    installation_address_city,
    installation_address_region,
    contact_id,
    contact_name,
    contact_email,
    contact_phone
  ) values (
    new.company_id,
    quotation_year,
    quotation_number,
    quotation_code,
    new.customer_id,
    null,
    null,
    null,
    null,
    null,
    null,
    new.id,
    current_date,
    null,
    'DRAFT',
    coalesce(nullif(trim(new.reference), ''), new.code),
    new.observations,
    0,
    0,
    0,
    0,
    null,
    0,
    null,
    null,
    null,
    null,
    null,
    'Dirección de instalación',
    new.site_street,
    new.site_postal_code,
    new.site_city,
    new.site_region,
    null,
    new.customer_name_snapshot,
    new.customer_email_snapshot,
    coalesce(new.customer_phone_snapshot, new.customer_mobile_snapshot)
  );

  insert into public.measurement_activity (
    measurement_id,
    event_type,
    message,
    created_by
  )
  select
    new.id,
    'QUOTATION_CREATED',
    'Presupuesto generado desde la medición: ' || quotation_code,
    new.updated_by;

  return new;
end;
$$;

drop trigger if exists trg_measurement_generate_quotation on public.measurement;

create trigger trg_measurement_generate_quotation
after update of status on public.measurement
for each row
execute function public.generate_quotation_from_measurement();
