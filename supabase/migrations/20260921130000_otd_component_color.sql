-- OTD components can pin the color of a characteristic-with-colors at OTD design
-- time (fixed pick from the color list already configured for that characteristic,
-- via characteristic_color), or resolve it dynamically from an OTD input/variable,
-- the same way characteristic_id/characteristic_expression already work. When
-- neither is set and the resolved characteristic groups more than one color, the
-- OTD runtime keeps asking the user to pick one manually (existing behavior).

alter table public.otd_component
  add column if not exists color_id bigint,
  add column if not exists color_expression text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'otd_component_color_id_fkey'
      and conrelid = 'public.otd_component'::regclass
  ) then
    alter table public.otd_component
      add constraint otd_component_color_id_fkey
      foreign key (color_id)
      references public.color(id);
  end if;
end $$;

create index if not exists idx_otd_component_color_id
  on public.otd_component(color_id);

comment on column public.otd_component.color_id is
  'Fixed color (from characteristic_color, scoped to characteristic_id) used by this OTD component. NULL if resolved dynamically or asked at runtime.';

comment on column public.otd_component.color_expression is
  'Dynamic color expression or system-variable reference, resolved the same way as characteristic_expression. Not evaluated by the editor.';
