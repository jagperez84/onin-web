-- 20260825000000_otd_unit_of_measure_system.sql creó unit_conversion con políticas
-- "cualquier usuario autenticado" (sin filtrar por company_id):
--   unit_conversion_authenticated_select/insert/update/delete using(auth.uid() is not null)
--
-- 20260901100000_harden_multi_tenant_rls.sql añadió después la política correcta
-- (unit_conversion_company_access, acotada por company_id = current_company_id()),
-- pero nunca hizo DROP de las 4 políticas antiguas. Postgres combina con OR las
-- políticas permisivas del mismo comando: al seguir vivas, las antiguas (sin ninguna
-- restricción) anulan en la práctica a la nueva. Resultado: cualquier usuario
-- autenticado de cualquier empresa puede hoy leer, insertar, modificar o borrar
-- unit_conversion de cualquier otra empresa.
drop policy if exists unit_conversion_authenticated_select on public.unit_conversion;
drop policy if exists unit_conversion_authenticated_insert on public.unit_conversion;
drop policy if exists unit_conversion_authenticated_update on public.unit_conversion;
drop policy if exists unit_conversion_authenticated_delete on public.unit_conversion;
