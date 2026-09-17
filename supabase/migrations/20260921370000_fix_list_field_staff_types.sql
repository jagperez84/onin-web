-- list_field_staff() declaraba username/display_name/role_code como text,
-- pero en user_account son character varying. RETURN QUERY exige tipos
-- exactos frente a lo declarado en RETURNS TABLE (no hay coerción implícita
-- varchar->text), así que la función fallaba con "structure of query does
-- not match function result type" — rompiendo Cuadrillas y Montajes, que
-- dependen de ella para resolver el personal de campo.
-- Mismos tipos que list_measurement_users (20260921260000), que sí están
-- confirmados contra el esquema real vía pg_get_functiondef.
create or replace function public.list_field_staff()
returns table (id bigint, username character varying, display_name character varying, role_code character varying, can_measure boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  return query
    select ua.id, ua.username, ua.display_name, ua.role_code, ua.can_measure
    from public.user_account ua
    where ua.company_id = public.admin_company_id()
      and ua.active = true
    order by ua.display_name;
end;
$$;
revoke all on function public.list_field_staff() from public;
grant execute on function public.list_field_staff() to authenticated;
