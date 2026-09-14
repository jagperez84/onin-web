-- Tipo de montaje a nivel de familia no tenía ningún consumidor real (solo se
-- guardaba y se mostraba en el listado/editor de Familias, sin usarse en precio,
-- corte, presupuesto ni ningún otro proceso) — se retira de la familia. El
-- catálogo de tipos de montaje (product_mounting_type) se conserva intacto,
-- pensado para un uso futuro a otro nivel.
alter table public.product_family drop column if exists mounting_type_id;

-- Una familia no puede ser confeccionable y recortable a la vez: son dos modos
-- de corte mutuamente excluyentes (confeccionable = lona/tela con costuras;
-- recortable = perfil/barra). El UI ya pasa a un desplegable único; se añade
-- aquí el mismo límite como CHECK para que la base de datos no permita un
-- estado inconsistente aunque se escriba desde fuera de la app.
--
-- Si alguna familia existente tuviera hoy ambos flags a true (el UI antiguo lo
-- permitía), se resuelve aquí a favor de "confeccionable" antes de añadir el
-- CHECK, para que la migración no falle por datos ya inconsistentes. Revisa
-- estas familias tras aplicar el SQL si el resultado no es el esperado:
--   select code, name from public.product_family where confectionable and recuttable;
-- (la consulta anterior, ejecutada ANTES de aplicar este bloque, te dirá cuáles
-- se han visto afectadas).
update public.product_family set recuttable = false where confectionable and recuttable;

alter table public.product_family drop constraint if exists product_family_cut_mode_ck;
alter table public.product_family add constraint product_family_cut_mode_ck
  check (not (confectionable and recuttable));
