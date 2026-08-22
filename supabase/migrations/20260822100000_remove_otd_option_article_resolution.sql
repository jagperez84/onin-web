-- OPTION values are configuration values only.
-- Article selection belongs exclusively to OTD components.

drop index if exists public.idx_otd_selection_option_product_id;

alter table public.otd_selection_option
  drop constraint if exists otd_selection_option_product_id_fkey;

alter table public.otd_selection_option
  drop column if exists product_id;

alter table public.otd_component
  drop column if exists product_selection_code;
