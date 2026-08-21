-- OTD article resolution by office selection.
--
-- An OTD input can resolve the article used by a component. This is different
-- from a characteristic dependency: a characteristic changes the resolved
-- variant of an existing article, while an article-selection dependency
-- chooses the actual ONIN product (e.g. LONA-BEIGE, LONA-GRIS).
--
-- Example:
--   OTD selection: TIPO_LONA
--   option BEIGE  -> product LONA-BEIGE
--   option GRIS   -> product LONA-GRIS
--   component LONA -> selection TIPO_LONA
--
-- This migration only establishes the persistent model. Runtime/editor code
-- must resolve the selected option to product_id before pricing/stock logic.

alter table public.otd_selection_option
  add column if not exists product_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'otd_selection_option_product_id_fkey'
      and conrelid = 'public.otd_selection_option'::regclass
  ) then
    alter table public.otd_selection_option
      add constraint otd_selection_option_product_id_fkey
      foreign key (product_id)
      references public.product(id);
  end if;
end $$;

create index if not exists idx_otd_selection_option_product_id
  on public.otd_selection_option(product_id);

alter table public.otd_component
  add column if not exists product_selection_expression text;

comment on column public.otd_selection_option.product_id is
  'Optional ONIN article selected when this OTD office option is chosen.';

comment on column public.otd_component.product_selection_expression is
  'OTD input/variable expression used to resolve the component article. Unlike characteristic_expression, this resolves the actual ONIN product.';
