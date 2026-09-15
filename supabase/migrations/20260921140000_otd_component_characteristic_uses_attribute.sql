-- otd_component.characteristic_id pointed at product_characteristic, a table with no
-- reachable screen from the article's own page (ProductCharacteristics.tsx exists but
-- is not linked from anywhere in the app; only /ventas/articulos/:id/caracteristicas by
-- typing the URL by hand). The only real, UI-reachable place to configure an article's
-- "característica" with colors is the Características panel on the article/family page
-- (ProductFamilyCharacteristicsPanel), backed by product_attribute (family inheritance +
-- article-level assignment, colors via attribute_color). Since no article could ever
-- have a product_characteristic row through the UI, otd_component.characteristic_id was
-- always NULL in practice — safe to repoint the FK with no data migration needed.

alter table public.otd_component
  drop constraint if exists otd_component_characteristic_id_fkey;

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
      references public.product_attribute(id);
  end if;
end $$;

comment on column public.otd_component.characteristic_id is
  'Fixed characteristic (product_attribute.id, resolved from family inheritance or article-level assignment) used by this OTD component.';

comment on column public.otd_component.characteristic_expression is
  'Dynamic characteristic expression or system-variable reference, matched against the product_attribute code/name resolved for the component''s article. Not evaluated by the editor.';

comment on column public.otd_component.color_id is
  'Fixed color (from attribute_color, scoped to the product_attribute in characteristic_id) used by this OTD component. NULL if resolved dynamically or asked at runtime.';
