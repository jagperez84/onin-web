-- delete_customer, restore_customer y list_measurement_users se usan desde el código
-- (src/services/core/customerRepository.ts, src/services/core/userRepository.ts) pero no
-- existían en ninguna migración versionada del repo — solo podían estar funcionando si alguien
-- las creó a mano en el editor SQL de Supabase, sin dejar constancia aquí (contradice la
-- convención de CLAUDE.md de mantener las migraciones en el repo). Reconstrucción best-effort a
-- partir de cómo las llama el cliente y del resto de funciones equivalentes del proyecto.

-- restore_customer: definición copiada tal cual de la que ya existía aplicada a mano en Supabase
-- (confirmada con pg_get_functiondef). Restaura customer.deleted_at, y también party.active y
-- party_role.active (solo el rol CUSTOMER) — a diferencia de lo que se había asumido al
-- reconstruirla sin verificar, el borrado/restauración sí toca party y party_role.
create or replace function public.restore_customer(p_customer_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_party_id bigint;
begin
  select party_id into v_party_id from public.customer where id=p_customer_id and deleted_at is not null;
  if v_party_id is null then raise exception 'Cliente no marcado para borrado'; end if;
  update public.customer set deleted_at=null, deleted_by=null, updated_at=now() where id=p_customer_id;
  update public.party set active=true, updated_at=now() where id=v_party_id;
  update public.party_role set active=true where party_id=v_party_id and role_code='CUSTOMER';
end;
$function$;
revoke all on function public.restore_customer(bigint) from public;
grant execute on function public.restore_customer(bigint) to authenticated;

-- delete_customer: pendiente de confirmar contra la definición real (mismo proceso que
-- restore_customer/list_measurement_users) antes de fusionar esta migración.
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

-- list_measurement_users: selector de medidor en Mediciones > Nueva medición. Mismo bypass de
-- RLS que list_field_staff (20260921210001_list_field_staff_rpc.sql) — user_account solo permite
-- SELECT de la fila propia o, si eres ADMIN, de tu empresa, así que un usuario no-ADMIN vería
-- ese selector vacío sin esto. Definición copiada tal cual de la que ya existía aplicada a mano
-- en Supabase (confirmada con pg_get_functiondef) — usa current_company_id()
-- (20260901100000_harden_multi_tenant_rls.sql), no admin_company_id().
create or replace function public.list_measurement_users(p_company_id bigint)
returns table(auth_user_id uuid, username character varying, display_name character varying, role_code character varying, can_measure boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select ua.auth_user_id, ua.username, ua.display_name, ua.role_code, ua.can_measure
  from public.user_account ua
  where ua.active
    and ua.can_measure
    and ua.company_id = public.current_company_id()
    and (p_company_id is null or p_company_id = public.current_company_id())
  order by ua.display_name;
$function$;
revoke all on function public.list_measurement_users(bigint) from public;
grant execute on function public.list_measurement_users(bigint) to authenticated;
