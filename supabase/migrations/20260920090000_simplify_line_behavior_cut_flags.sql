-- Simplifica el comportamiento de línea: quita cut_calculation_enabled, length_enabled
-- y canvas_cut_enabled de product_line_behavior.
--
-- Los tres solo servían para activar (vía OR, sin que ninguno mandara sobre el otro) la
-- misma previsualización de corte en el presupuesto que ya activaba
-- product_family.confectionable/recuttable — dos interruptores independientes, a dos
-- niveles distintos, para un mismo resultado. A partir de ahora esa previsualización
-- (calculateCuts, en cutCalculationService.ts) depende únicamente de la familia.
--
-- El resto de flags de product_line_behavior (quantity_enabled, price_enabled,
-- discount_enabled, dimensions_enabled, configuration_enabled, characteristics_enabled)
-- no tiene equivalente en product_family y no se toca.
alter table public.product_line_behavior drop column if exists cut_calculation_enabled;
alter table public.product_line_behavior drop column if exists length_enabled;
alter table public.product_line_behavior drop column if exists canvas_cut_enabled;
