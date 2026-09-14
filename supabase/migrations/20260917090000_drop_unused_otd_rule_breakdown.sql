-- Retira otd_rule y otd_breakdown: dos tablas del motor OTD que nunca llegaron a
-- usarse. Verificado a fondo (servicios, pantallas, RPCs): ni el editor de OTD
-- (OtdEditor.tsx) ni el cálculo de configuración (otdCalculationService.ts) las leen
-- ni las escriben — el cálculo de reglas/desglose de un OTD se hace en memoria, no
-- contra estas tablas. Solo aparecían en el endurecimiento de RLS multiempresa
-- (20260901100000) y en el bucle genérico de copia de datos demo (20260831204725),
-- ambos ajustados aquí para no dejar referencias colgando a tablas inexistentes.
--
-- drop table quita también sus políticas RLS (otd_rule_company_access,
-- otd_breakdown_company_access) al ir ligadas a la tabla.

drop table if exists public.otd_rule;
drop table if exists public.otd_breakdown;
