-- Migration: Add deleted_at column to quotation and support CANCELLED status
alter table public.quotation
  add column if not exists deleted_at timestamptz;

create index if not exists idx_quotation_deleted_at on public.quotation(deleted_at);

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'quotation_status_ck') then
    alter table public.quotation drop constraint quotation_status_ck;
    alter table public.quotation add constraint quotation_status_ck check (status in ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'));
  end if;
end $$;
