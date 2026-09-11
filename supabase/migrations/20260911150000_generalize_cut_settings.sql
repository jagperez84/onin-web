-- Generaliza los parámetros de cálculo de corte (antes fijos en el código, pensados
-- solo para toldo enrollable) para que cada línea de comportamiento de producto
-- (product_line_behavior) pueda definir su propio ancho de rollo, márgenes de
-- costura, longitud de barra estándar y estimación de perfiles cuando el artículo
-- aún no tiene despiece configurado.
--
-- Todas las columnas son opcionales (NULL): si no se rellenan, el motor de cálculo
-- sigue usando exactamente los valores históricos (rollo 1,20 m; dobladillo 40 mm;
-- vaina 250 mm; barra 6 m; estimación "perfil de carga + tubo de enrolle"), así que
-- esta migración no cambia el comportamiento de ningún artículo existente. Solo al
-- configurar una línea de comportamiento nueva (p. ej. Pérgolas, Piscinas) hace
-- falta rellenar estos campos si sus valores por defecto no encajan.

alter table public.product_line_behavior add column if not exists roll_width_m numeric;
alter table public.product_line_behavior add column if not exists seam_allowance_width_m numeric;
alter table public.product_line_behavior add column if not exists seam_allowance_height_m numeric;
alter table public.product_line_behavior add column if not exists standard_bar_length_mm numeric;
-- Array de {code,name,end_deduction_mm,color?} en JSON. NULL = usar la estimación
-- histórica de toldo enrollable; [] = no mostrar ninguna estimación cuando falte
-- despiece (recomendado para líneas que no son un toldo enrollable).
alter table public.product_line_behavior add column if not exists fallback_profile_estimates jsonb;

comment on column public.product_line_behavior.roll_width_m is 'Ancho de rollo de material en metros (por defecto 1.20 si es NULL).';
comment on column public.product_line_behavior.seam_allowance_width_m is 'Margen lateral de dobladillo en metros (por defecto 0.04 si es NULL).';
comment on column public.product_line_behavior.seam_allowance_height_m is 'Margen de vaina/enrolle en metros (por defecto 0.25 si es NULL).';
comment on column public.product_line_behavior.standard_bar_length_mm is 'Longitud de barra estándar de perfil en mm (por defecto 6000 si es NULL).';
comment on column public.product_line_behavior.fallback_profile_estimates is 'Estimación de perfiles a mostrar cuando el artículo no tiene despiece configurado. NULL = estimación histórica de toldo; [] = ninguna.';
