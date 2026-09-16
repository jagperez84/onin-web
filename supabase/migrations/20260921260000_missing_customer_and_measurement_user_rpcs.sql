-- delete_customer, restore_customer y list_measurement_users se usan desde el código
-- (src/services/core/customerRepository.ts, src/services/core/userRepository.ts) pero no
-- existían en ninguna migración versionada del repo — solo podían estar funcionando si alguien
-- las creó a mano en el editor SQL de Supabase, sin dejar constancia aquí (contradice la
-- convención de CLAUDE.md de mantener las migraciones en el repo). Reconstrucción best-effort a
-- partir de cómo las llama el cliente y del resto de funciones equivalentes del proyecto.

-- delete_customer / restore_customer: borrado lógico simple sobre customer.deleted_at, mismo
-- patrón que address/contact (ver customerRepository.ts) pero como función porque el cliente ya
-- la invoca vía rpc(). No toca party ni party_role: un party puede tener otros roles además de
-- CUSTOMER, así que borrar el cliente no debe desactivar la entidad completa.
create or replace function public.delete_customer(p_customer_id bigint)
returns void
language plpgsql
security invoker
as $$
declare
  v_deleted_by bigint;
begin
  select id into v_deleted_by from public.user_account where auth_user_id = auth.uid();
  update public.customer
  set deleted_at = now(), deleted_by = v_deleted_by
  where id = p_customer_id and deleted_at is null;
  if not found then
    raise exception 'El cliente no existe o ya está marcado para borrado';
  end if;
end;
$$;
revoke all on function public.delete_customer(bigint) from public;
grant execute on function public.delete_customer(bigint) to authenticated;

create or replace function public.restore_customer(p_customer_id bigint)
returns void
language plpgsql
security invoker
as $$
begin
  update public.customer
  set deleted_at = null, deleted_by = null
  where id = p_customer_id and deleted_at is not null;
  if not found then
    raise exception 'El cliente no existe o no está marcado para borrado';
  end if;
end;
$$;
revoke all on function public.restore_customer(bigint) from public;
grant execute on function public.restore_customer(bigint) to authenticated;

-- list_measurement_users: selector de medidor en Mediciones > Nueva medición. Mismo bypass de
-- RLS que list_field_staff (20260921210001_list_field_staff_rpc.sql) — user_account solo permite
-- SELECT de la fila propia o, si eres ADMIN, de tu empresa, así que un usuario no-ADMIN vería
-- ese selector vacío sin esto. p_company_id se conserva en la firma por compatibilidad con la
-- llamada existente del cliente, pero se ignora: la empresa siempre se resuelve del propio
-- llamante (admin_company_id()), nunca de lo que envíe el cliente.
create or replace function public.list_measurement_users(p_company_id bigint default null)
returns table (auth_user_id uuid, username text, display_name text, role_code text, can_measure boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select ua.auth_user_id, ua.username, ua.display_name, ua.role_code, ua.can_measure
    from public.user_account ua
    where ua.company_id = public.admin_company_id()
      and ua.active = true
      and ua.can_measure = true
    order by ua.display_name;
end;
$$;
revoke all on function public.list_measurement_users(bigint) from public;
grant execute on function public.list_measurement_users(bigint) to authenticated;
