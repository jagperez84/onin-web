-- Direct article resolution for OTD office options.
-- An OPTION can resolve to a real ONIN product. A component explicitly declares
-- which office input controls its product; this is intentionally independent
-- from characteristic resolution.

alter table public.otd_selection_option
  add column if not exists product_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'otd_selection_option_product_id_fkey'
      and conrelid = 'public.otd_selection_option'::regclass
  ) then
    alter table public.otd_selection_option
      add constraint otd_selection_option_product_id_fkey
      foreign key (product_id) references public.product(id);
  end if;
end $$;

create index if not exists idx_otd_selection_option_product_id
  on public.otd_selection_option(product_id);

alter table public.otd_component
  add column if not exists product_selection_code varchar(100);

comment on column public.otd_selection_option.product_id is
  'ONIN product resolved when this office option is selected.';

comment on column public.otd_component.product_selection_code is
  'OTD office input code that explicitly resolves this component product from its selected option.';
