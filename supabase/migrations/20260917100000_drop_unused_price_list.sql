-- Retira price_list, price_list_line y party_price_list: un mecanismo de tarifas
-- por cliente que nunca llegó a tener funcionalidad de aplicación detrás. Solo se
-- usaban para sembrar una tarifa "PVP-DEMO" en la empresa de demostración
-- (20260831204930) y en el bucle genérico de copia de datos demo (20260831204725) y
-- el endurecimiento de RLS multiempresa (20260901100000) — nunca hay una sola
-- lectura o escritura desde src/ (ni servicios ni pantallas).
--
-- Orden de borrado: las tablas hijas primero (referencian price_list_id) para no
-- toparse con la dependencia de clave foránea.

drop table if exists public.party_price_list;
drop table if exists public.price_list_line;
drop table if exists public.price_list;
