-- OTD components can resolve an article characteristic dynamically.
-- A fixed characteristic uses characteristic_id; a dynamic characteristic
-- stores the expression/variable that the future OTD engine will resolve.

alter table public.otd_component
  add column if not exists characteristic_id bigint,
  add column if not exists characteristic_expression text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'otd_component_characteristic_id_fkey'
      and conrelid = 'public.otd_component'::regclass
  ) then
    alter table public.otd_component
      add constraint otd_component_characteristic_id_fkey
      foreign key (characteristic_id)
      references public.product_characteristic(id);
  end if;
end $$;

create index if not exists idx_otd_component_characteristic_id
  on public.otd_component(characteristic_id);

comment on column public.otd_component.characteristic_id is
  'Fixed product characteristic/variant used by this OTD component.';

comment on column public.otd_component.characteristic_expression is
  'Dynamic characteristic expression or system-variable reference. It is stored for the OTD calculation engine and is not evaluated by the editor.';
