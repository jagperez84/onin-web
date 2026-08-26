alter table public.otd_selection
  add column if not exists is_dimension boolean not null default false;

create index if not exists idx_otd_selection_dimension
  on public.otd_selection (otd_id, is_dimension);
