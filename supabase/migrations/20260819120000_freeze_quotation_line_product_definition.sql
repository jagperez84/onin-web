-- 2B.7.1a: freeze the product definition used by a quotation line.
-- The quotation line stores an immutable snapshot of the article definition.
-- Instance values remain editable; article master data does not.

alter table public.quotation_line
  add column if not exists product_definition_snapshot jsonb;

comment on column public.quotation_line.product_definition_snapshot is
  'Immutable snapshot of the product definition used when the quotation line was created: measurement type/dimensions and characteristic definitions. The line stores instance values separately.';

create index if not exists ix_quotation_line_product_definition_snapshot
  on public.quotation_line using gin(product_definition_snapshot);
