-- Paso 6: catálogo configurable de comportamientos de línea.
-- Los comportamientos son datos de configuración, no tipos de artículo codificados.
-- Se crean los comportamientos base para cada empresa existente.
insert into public.product_line_behavior (
  company_id, code, name, description,
  quantity_enabled, price_enabled, discount_enabled,
  dimensions_enabled, configuration_enabled, cut_calculation_enabled,
  length_enabled, characteristics_enabled, canvas_cut_enabled
)
select c.id, v.code, v.name, v.description,
       v.quantity_enabled, v.price_enabled, v.discount_enabled,
       v.dimensions_enabled, v.configuration_enabled, v.cut_calculation_enabled,
       v.length_enabled, v.characteristics_enabled, v.canvas_cut_enabled
from public.company c
cross join (values
  ('NORMAL','Normal','Cantidad, precio y descuento.',true,true,true,false,false,false,false,false,false),
  ('OTD','Configurado / OTD','Dimensiones, variables/configuración y cálculo.',true,true,true,true,true,true,false,true,false),
  ('PERFIL','Perfil','Longitud, características y cálculo de corte.',true,true,true,true,false,true,true,true,false),
  ('LONA','Lona','Línea, salida, tipo de corte, dobladillo/solape y selección de ancho.',true,true,true,true,false,true,false,true,true)
) as v(code,name,description,quantity_enabled,price_enabled,discount_enabled,dimensions_enabled,configuration_enabled,cut_calculation_enabled,length_enabled,characteristics_enabled,canvas_cut_enabled)
on conflict (company_id, code) do nothing;

create index if not exists idx_product_family_line_behavior on public.product_family(line_behavior_id);
