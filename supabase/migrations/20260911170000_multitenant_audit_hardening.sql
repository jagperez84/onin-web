-- Multitenant hardening found during repository-wide audit.
-- Goal: make the active company (public.current_company_id()) the authoritative tenant boundary.

-- 1) OTD direct scales were created without RLS and were omitted from the previous
--    multitenant hardening migration. They inherit tenant ownership from OTD.
alter table public.otd_scale enable row level security;

drop policy if exists otd_scale_company_access on public.otd_scale;
create policy otd_scale_company_access on public.otd_scale
for all
using (
  exists (
    select 1
    from public.otd o
    where o.id = otd_scale.otd_id
      and o.company_id = public.current_company_id()
  )
)
with check (
  exists (
    select 1
    from public.otd o
    where o.id = otd_scale.otd_id
      and o.company_id = public.current_company_id()
  )
);

-- 2) Legacy unit_conversion policies granted every authenticated user access.
--    PostgreSQL combines permissive policies with OR, so those policies defeat the
--    newer company-scoped policy unless they are explicitly removed.
drop policy if exists unit_conversion_authenticated_select on public.unit_conversion;
drop policy if exists unit_conversion_authenticated_insert on public.unit_conversion;
drop policy if exists unit_conversion_authenticated_update on public.unit_conversion;
drop policy if exists unit_conversion_authenticated_delete on public.unit_conversion;

alter table public.unit_conversion enable row level security;
drop policy if exists unit_conversion_company_access on public.unit_conversion;
create policy unit_conversion_company_access on public.unit_conversion
for all
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

-- 3) Measurement sequence was left with generic authenticated policies.
--    Keep sequence allocation isolated per active company.
alter table public.measurement_sequence enable row level security;

drop policy if exists measurement_sequence_authenticated_select on public.measurement_sequence;
drop policy if exists measurement_sequence_authenticated_insert on public.measurement_sequence;
drop policy if exists measurement_sequence_authenticated_update on public.measurement_sequence;

drop policy if exists measurement_sequence_company_select on public.measurement_sequence;
drop policy if exists measurement_sequence_company_insert on public.measurement_sequence;
drop policy if exists measurement_sequence_company_update on public.measurement_sequence;

create policy measurement_sequence_company_select on public.measurement_sequence
for select
using (company_id = public.current_company_id());

create policy measurement_sequence_company_insert on public.measurement_sequence
for insert
with check (company_id = public.current_company_id());

create policy measurement_sequence_company_update on public.measurement_sequence
for update
using (company_id = public.current_company_id())
with check (company_id = public.current_company_id());

-- 4) Storage policies for measurement photos used assignment-only checks.
--    A user belonging to multiple companies could therefore access a photo from a
--    non-active company when that same auth user was assigned there. Make Storage
--    obey the same active-company boundary as the relational tables.
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
    select 1
    from public.measurement m
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
    select 1
    from public.measurement m
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
    select 1
    from public.measurement m
    where m.id = split_part(name, '/', 2)::bigint
      and m.company_id = public.current_company_id()
  )
);
