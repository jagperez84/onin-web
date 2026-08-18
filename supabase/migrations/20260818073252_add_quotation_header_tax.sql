alter table public.quotation
  add column if not exists tax_rate_id bigint,
  add column if not exists tax_percent numeric(8,3) not null default 0;

alter table public.quotation
  drop constraint if exists quotation_tax_rate_id_fkey;

alter table public.quotation
  add constraint quotation_tax_rate_id_fkey
  foreign key (tax_rate_id) references public.tax_rate(id);

create index if not exists idx_quotation_tax_rate_id on public.quotation(tax_rate_id);
