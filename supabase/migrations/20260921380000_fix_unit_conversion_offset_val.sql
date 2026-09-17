-- "column unit_conversion.offset_val does not exist" en Conversiones de
-- unidades: la tabla se creó en 20260825000000_otd_unit_of_measure_system.sql
-- con offset_val ya incluida, y el código (unitConversionRepository.ts) la
-- usa desde siempre — no hay ningún cambio de nombre en el repo. El desajuste
-- está en la base real: probablemente solo se llegó a pegar/ejecutar parte
-- de aquella migración desde el editor SQL. Se añade la columna si falta y
-- se refresca la caché de esquema de PostgREST, que si no se queda con la
-- versión antigua de la tabla aunque el ALTER ya se haya aplicado.
alter table public.unit_conversion
  add column if not exists offset_val numeric(20, 10) not null default 0;

notify pgrst, 'reload schema';
