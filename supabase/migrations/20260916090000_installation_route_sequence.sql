-- Orden de ruta dentro del mapa del día de la Agenda (fase 3).
--
-- Cuando una cuadrilla tiene varias visitas el mismo día, route_sequence fija en qué
-- orden se visitan (se reordena a mano con flechas subir/bajar en la vista de día).
-- No sustituye a scheduled_date/start_time: es solo la secuencia dentro de ese día,
-- usada para numerar los pines del mapa y trazar la línea de ruta por cuadrilla.

alter table public.installation add column if not exists route_sequence smallint;
