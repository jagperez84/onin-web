-- TipoControl no representa un comportamiento independiente en Onin Web.
-- Su responsabilidad histórica estaba ligada a la configuración de medidas,
-- que ahora se modela mediante TipoMedida y el futuro motor de fórmulas.

alter table public.product_family
  drop column if exists control_type_id;

drop table if exists public.product_control_type;
