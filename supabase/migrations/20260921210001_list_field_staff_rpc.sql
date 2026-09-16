-- RPC de solo lectura para listar el personal de campo (instaladores / medidores) de la propia
-- empresa, sin depender de las políticas RLS de user_account (que hoy solo permiten SELECT de la
-- fila propia o, si el llamante es ADMIN, de las de su empresa). Sin esto, un usuario no-ADMIN ve
-- vacíos los listados de instaladores/cuadrillas en Montajes, Cuadrillas y la Agenda.
-- Mismo patrón de bypass (SECURITY DEFINER en PL/pgSQL) que public.is_admin()/admin_company_id()
-- definidos en 20260911140000_user_permissions_and_admin_rls.sql.
create or replace function public.list_field_staff()
returns table (id bigint, username text, display_name text, role_code text, can_measure boolean)
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
