create or replace function public.create_customer(
  p_company_id bigint,
  p_legal_name varchar,
  p_trade_name varchar default null,
  p_tax_id varchar default null,
  p_email varchar default null,
  p_phone varchar default null,
  p_active boolean default true,
  p_notes text default null
) returns bigint
language plpgsql
security invoker
as $$
declare
  v_party_id bigint;
  v_customer_id bigint;
begin
  if coalesce(trim(p_legal_name),'') = '' then
    raise exception 'La razón social es obligatoria';
  end if;
  if coalesce(trim(p_tax_id),'') = '' then
    raise exception 'El CIF/NIF es obligatorio';
  end if;
  if exists (
    select 1 from public.party
    where company_id = p_company_id
      and upper(trim(tax_id)) = upper(trim(p_tax_id))
      and tax_id is not null
  ) then
    raise exception 'Ya existe una entidad con el CIF/NIF indicado';
  end if;

  insert into public.party(company_id, legal_name, trade_name, tax_id, email, phone, active)
  values(p_company_id, trim(p_legal_name), nullif(trim(p_trade_name),''), upper(trim(p_tax_id)), nullif(trim(p_email),''), nullif(trim(p_phone),''), coalesce(p_active,true))
  returning id into v_party_id;

  insert into public.customer(party_id) values(v_party_id) returning id into v_customer_id;
  insert into public.party_role(party_id, role_code, active) values(v_party_id, 'CUSTOMER', coalesce(p_active,true));

  return v_customer_id;
end;
$$;
