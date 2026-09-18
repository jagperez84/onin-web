-- Amplía el log de auditoría (20260921390000_audit_log.sql) a artículos y
-- precios: product (datos del artículo, incluido su precio de venta),
-- product_supplier (precios de proveedor) y product_scale (precios por
-- escalado/dimensión). No se incluye el resto de catálogo (familias,
-- características, maestro de colores) por ahora.
--
-- product_supplier y product_scale no tienen company_id propio — se
-- resuelven vía su product_id, igual que ya se hacía para
-- invoice_installment/user_module_permission en la migración anterior.

create or replace function public.audit_log_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
  v_company bigint;
  v_record bigint;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(NEW);
    v_record := (v_new->>'id')::bigint;
    v_company := nullif(v_new->>'company_id', '')::bigint;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record := (v_new->>'id')::bigint;
    v_company := nullif(v_new->>'company_id', '')::bigint;
    select array_agg(n.key order by n.key) into v_changed
    from jsonb_each(v_new) n
    where n.key <> 'updated_at' and n.value is distinct from (v_old -> n.key);
    if v_changed is null then
      return NEW;
    end if;
  else
    v_old := to_jsonb(OLD);
    v_record := (v_old->>'id')::bigint;
    v_company := nullif(v_old->>'company_id', '')::bigint;
  end if;

  if v_company is null then
    if tg_table_name = 'invoice_installment' then
      select company_id into v_company from public.invoice
      where id = coalesce((v_new->>'invoice_id')::bigint, (v_old->>'invoice_id')::bigint);
    elsif tg_table_name = 'user_module_permission' then
      select company_id into v_company from public.user_account
      where id = coalesce((v_new->>'user_account_id')::bigint, (v_old->>'user_account_id')::bigint);
    elsif tg_table_name in ('product_supplier', 'product_scale') then
      select company_id into v_company from public.product
      where id = coalesce((v_new->>'product_id')::bigint, (v_old->>'product_id')::bigint);
    end if;
  end if;

  insert into public.audit_log (company_id, table_name, record_id, action, changed_by, changed_fields, old_data, new_data)
  values (v_company, tg_table_name, v_record, tg_op, auth.uid(), v_changed, v_old, v_new);

  if tg_op = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;
revoke all on function public.audit_log_row() from public;

do $$
declare
  t text;
begin
  foreach t in array array['product', 'product_supplier', 'product_scale']
  loop
    execute format('drop trigger if exists audit_log_trg on public.%I', t);
    execute format(
      'create trigger audit_log_trg after insert or update or delete on public.%I for each row execute function public.audit_log_row()',
      t
    );
  end loop;
end;
$$;
