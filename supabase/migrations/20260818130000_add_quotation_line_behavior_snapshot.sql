alter table public.quotation_line
  add column if not exists line_behavior_id bigint references public.product_line_behavior(id),
  add column if not exists line_behavior_snapshot jsonb;

create index if not exists ix_quotation_line_behavior_id
  on public.quotation_line(line_behavior_id);

comment on column public.quotation_line.line_behavior_snapshot is
  'Snapshot of the effective product line behavior at quotation creation time. Keeps the quotation stable if the master behavior is changed later.';
