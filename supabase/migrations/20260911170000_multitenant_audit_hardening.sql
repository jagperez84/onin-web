-- Multitenant hardening found during repository-wide audit.
-- Goal: make the active company (public.current_company_id()) the authoritative tenant boundary.

-- 1) OTD direct scales inherit tenant ownership from OTD.
-- On the current production database this table has not yet been deployed, but it
-- exists in repository migrations. Fresh/replayed environments must never expose it
-- without RLS.
do $$
begin
  if to_regclass('public.otd_scale') is not null then
    execute 'alter table public.otd_scale enable row level security';
    execute 'drop policy if exists otd_scale_company_access on public.otd_scale';
    execute $policy$
      create policy otd_scale_company_access on public.otd_scale
      for all to authenticated
      using (
        exists (
          select 1 from public.otd o
          where o.id = otd_scale.otd_id
            and o.company_id = public.current_company_id()
        )
      )
      with check (
        exists (
          select 1 from public.otd o
          where o.id = otd_scale.otd_id
            and o.company_id = public.current_company_id()
        )
      )
    $policy$;
  end if;
end $$;

-- 2) Legacy unit_conversion policies granted every authenticated user access.
-- PostgreSQL combines permissive policies with OR, so old broad policies must be
-- explicitly removed even when a company-scoped policy also exists.
drop policy if exists unit_conversion_authenticated_select on public.unit_conversion;
drop policy if exists unit_conversion_authenticated_insert on public.unit_conversion;
drop policy if exists unit_conversion_authenticated_update on public.unit_conversion;
drop policy if exists unit_conversion_authenticated_delete on public.unit_conversion;

alter table public.unit_conversion enable row level security;
drop policy if exists unit_conversion_company_access on public.unit_conversion;
create policy unit_conversion_company_access on public.unit_conversion
for all to authenticated
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

-- 3) Measurement sequence was left with generic authenticated policies.
-- A caller could otherwise read/update counters belonging to another company.
alter table public.measurement_sequence enable row level security;

drop policy if exists measurement_sequence_authenticated_select on public.measurement_sequence;
drop policy if exists measurement_sequence_authenticated_insert on public.measurement_sequence;
drop policy if exists measurement_sequence_authenticated_update on public.measurement_sequence;
drop policy if exists measurement_sequence_company_select on public.measurement_sequence;
drop policy if exists measurement_sequence_company_insert on public.measurement_sequence;
drop policy if exists measurement_sequence_company_update on public.measurement_sequence;

create policy measurement_sequence_company_select on public.measurement_sequence
for select to authenticated
using (company_id = public.current_company_id());

create policy measurement_sequence_company_insert on public.measurement_sequence
for insert to authenticated
with check (company_id = public.current_company_id());

create policy measurement_sequence_company_update on public.measurement_sequence
for update to authenticated
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

-- 4) Storage policies for measurement photos used assignment-only checks.
-- An auth user assigned in more than one company could access objects belonging to a
-- non-current company. Storage now follows the same active-company boundary as the DB.
drop policy if exists measurement_photos_select_assigned on storage.objects;
drop policy if exists measurement_photos_insert_assigned on storage.objects;
drop policy if exists measurement_photos_delete_assigned on storage.objects;
drop policy if exists measurement_photos_company_select on storage.objects;
drop policy if exists measurement_photos_company_insert on storage.objects;
drop policy if exists measurement_photos_company_delete on storage.objects;

create policy measurement_photos_company_select on storage.objects
for select to authenticated
using (
  bucket_id = 'measurement-photos'
  and split_part(name, '/', 1) = 'measurements'
  and split_part(name, '/', 2) ~ '^[0-9]+$'
  and exists (
    select 1 from public.measurement m
    where m.id = split_part(name, '/', 2)::bigint
      and m.company_id = public.current_company_id()
  )
);

create policy measurement_photos_company_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'measurement-photos'
  and split_part(name, '/', 1) = 'measurements'
  and split_part(name, '/', 2) ~ '^[0-9]+$'
  and exists (
    select 1 from public.measurement m
    where m.id = split_part(name, '/', 2)::bigint
      and m.company_id = public.current_company_id()
  )
);

create policy measurement_photos_company_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'measurement-photos'
  and split_part(name, '/', 1) = 'measurements'
  and split_part(name, '/', 2) ~ '^[0-9]+$'
  and exists (
    select 1 from public.measurement m
    where m.id = split_part(name, '/', 2)::bigint
      and m.company_id = public.current_company_id()
  )
);

-- 5) Public tables flagged by the database security advisor.
-- document_status is intentional global reference data: authenticated users may read
-- it, but there is no client-side write policy.
alter table public.document_status enable row level security;
drop policy if exists document_status_reference_select on public.document_status;
create policy document_status_reference_select on public.document_status
for select to authenticated
using (true);

-- document_relation is tenant-owned through both linked sales documents. Both ends
-- must belong to the current company; this also prevents cross-company relations.
alter table public.document_relation enable row level security;
drop policy if exists document_relation_company_access on public.document_relation;
create policy document_relation_company_access on public.document_relation
for all to authenticated
using (
  exists (
    select 1
    from public.sales_document s
    join public.sales_document t on t.id = document_relation.target_document_id
    where s.id = document_relation.source_document_id
      and s.company_id = public.current_company_id()
      and t.company_id = public.current_company_id()
  )
)
with check (
  exists (
    select 1
    from public.sales_document s
    join public.sales_document t on t.id = document_relation.target_document_id
    where s.id = document_relation.source_document_id
      and s.company_id = public.current_company_id()
      and t.company_id = public.current_company_id()
  )
);

-- 6) The admin policy on user_account was tenant-blind. is_user_admin() only proved
-- that the caller is ADMIN in the active company; USING(is_user_admin()) alone then
-- made every user_account row visible/editable. Constrain the target row too.
drop policy if exists user_account_admin_select on public.user_account;
drop policy if exists user_account_admin_insert on public.user_account;
drop policy if exists user_account_admin_update on public.user_account;

create policy user_account_admin_select on public.user_account
for select to authenticated
using (
  public.is_user_admin()
  and company_id = public.current_company_id()
);

create policy user_account_admin_insert on public.user_account
for insert to authenticated
with check (
  public.is_user_admin()
  and company_id = public.current_company_id()
);

create policy user_account_admin_update on public.user_account
for update to authenticated
using (
  public.is_user_admin()
  and company_id = public.current_company_id()
)
with check (
  public.is_user_admin()
  and company_id = public.current_company_id()
);

-- Keep the existing self-select policy: a user needs to resolve their own active
-- company even when they are not an admin.

-- 7) Legacy SECURITY DEFINER customer RPCs bypass RLS. Convert the ID-based RPCs
-- used by/available to clients to SECURITY INVOKER so the company policies on
-- customer/party/party_role are authoritative. ACLs are narrowed to signed-in users.
do $$
begin
  if to_regprocedure('public.delete_customer(bigint)') is not null then
    execute 'alter function public.delete_customer(bigint) security invoker';
    execute 'revoke all on function public.delete_customer(bigint) from public, anon';
    execute 'grant execute on function public.delete_customer(bigint) to authenticated';
  end if;
  if to_regprocedure('public.restore_customer(bigint)') is not null then
    execute 'alter function public.restore_customer(bigint) security invoker';
    execute 'revoke all on function public.restore_customer(bigint) from public, anon';
    execute 'grant execute on function public.restore_customer(bigint) to authenticated';
  end if;
  if to_regprocedure('public.deactivate_customer(bigint)') is not null then
    execute 'alter function public.deactivate_customer(bigint) security invoker';
    execute 'revoke all on function public.deactivate_customer(bigint) from public, anon';
    execute 'grant execute on function public.deactivate_customer(bigint) to authenticated';
  end if;
  if to_regprocedure('public.update_customer(bigint,text,text,text,text,text,boolean)') is not null then
    execute 'alter function public.update_customer(bigint,text,text,text,text,text,boolean) security invoker';
    execute 'revoke all on function public.update_customer(bigint,text,text,text,text,text,boolean) from public, anon';
    execute 'grant execute on function public.update_customer(bigint,text,text,text,text,text,boolean) to authenticated';
  end if;

  -- Stale overload: it chooses the first active company and is not used by the
  -- current frontend. Disable the public API surface instead of allowing realm drift.
  if to_regprocedure('public.create_customer(text,text,text,text,text)') is not null then
    execute 'revoke all on function public.create_customer(text,text,text,text,text) from public, anon, authenticated';
  end if;
end $$;

-- The current company-aware create_customer overload remains SECURITY INVOKER.
do $$
begin
  if to_regprocedure('public.create_customer(bigint,character varying,character varying,character varying,character varying,character varying,boolean,text)') is not null then
    execute 'alter function public.create_customer(bigint,character varying,character varying,character varying,character varying,character varying,boolean,text) security invoker';
    execute 'revoke all on function public.create_customer(bigint,character varying,character varying,character varying,character varying,character varying,boolean,text) from public, anon';
    execute 'grant execute on function public.create_customer(bigint,character varying,character varying,character varying,character varying,character varying,boolean,text) to authenticated';
  end if;
end $$;

-- 8) Tenant helper RPCs are deliberately SECURITY DEFINER because they must resolve
-- membership/current-company data behind RLS. They must not be callable anonymously.
do $$
begin
  if to_regprocedure('public.current_company_id()') is not null then
    execute 'revoke all on function public.current_company_id() from public, anon';
    execute 'grant execute on function public.current_company_id() to authenticated';
  end if;
  if to_regprocedure('public.is_user_admin()') is not null then
    execute 'revoke all on function public.is_user_admin() from public, anon';
    execute 'grant execute on function public.is_user_admin() to authenticated';
  end if;
  if to_regprocedure('public.list_my_companies()') is not null then
    execute 'revoke all on function public.list_my_companies() from public, anon';
    execute 'grant execute on function public.list_my_companies() to authenticated';
  end if;
  if to_regprocedure('public.switch_my_company(bigint)') is not null then
    execute 'revoke all on function public.switch_my_company(bigint) from public, anon';
    execute 'grant execute on function public.switch_my_company(bigint) to authenticated';
  end if;
  if to_regprocedure('public.list_measurement_users(bigint)') is not null then
    execute 'revoke all on function public.list_measurement_users(bigint) from public, anon';
    execute 'grant execute on function public.list_measurement_users(bigint) to authenticated';
  end if;
end $$;

-- 9) v_user_account currently runs with the view owner's privileges. Make it an
-- invoker view so user_account RLS applies to the caller.
do $$
begin
  if to_regclass('public.v_user_account') is not null then
    execute 'alter view public.v_user_account set (security_invoker = true)';
    execute 'revoke all on public.v_user_account from anon';
    execute 'grant select on public.v_user_account to authenticated';
  end if;
end $$;
