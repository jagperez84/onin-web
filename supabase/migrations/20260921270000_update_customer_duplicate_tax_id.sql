-- create_customer ya valida que el CIF/NIF no esté duplicado dentro de la empresa, pero
-- updateCustomer (src/services/core/customerRepository.ts) hacía un update directo sobre
-- `party` sin ninguna comprobación: se podía editar la ficha de un cliente existente y ponerle
-- el mismo CIF/NIF que otro cliente activo, sin ningún rechazo. Se añade update_customer con la
-- misma validación (y bajo FOR UPDATE para evitar que dos ediciones concurrentes con el mismo
-- CIF/NIF pasen ambas la comprobación antes de que ninguna confirme).
create or replace function public.update_customer(
  p_customer_id bigint,
  p_legal_name varchar,
  p_trade_name varchar default null,
  p_tax_id varchar default null,
  p_email varchar default null,
  p_phone varchar default null,
  p_active boolean default true
) returns void
language plpgsql
security invoker
as $$
declare
  v_party_id bigint;
  v_company_id bigint;
begin
  if coalesce(trim(p_legal_name),'') = '' then
    raise exception 'La razón social es obligatoria';
  end if;
  if coalesce(trim(p_tax_id),'') = '' then
    raise exception 'El CIF/NIF es obligatorio';
  end if;

  select c.party_id into v_party_id from public.customer c where c.id = p_customer_id;
  if v_party_id is null then
    raise exception 'El cliente no existe';
  end if;

  select company_id into v_company_id from public.party where id = v_party_id for update;

  if exists (
    select 1 from public.party
    where company_id = v_company_id
      and id <> v_party_id
      and tax_id is not null
      and upper(trim(tax_id)) = upper(trim(p_tax_id))
  ) then
    raise exception 'Ya existe una entidad con el CIF/NIF indicado';
  end if;

  update public.party
  set legal_name = trim(p_legal_name),
      trade_name = nullif(trim(p_trade_name), ''),
      tax_id = upper(trim(p_tax_id)),
      email = nullif(trim(p_email), ''),
      phone = nullif(trim(p_phone), ''),
      active = coalesce(p_active, true)
  where id = v_party_id;
end;
$$;
revoke all on function public.update_customer(bigint,varchar,varchar,varchar,varchar,varchar,boolean) from public;
grant execute on function public.update_customer(bigint,varchar,varchar,varchar,varchar,varchar,boolean) to authenticated;
