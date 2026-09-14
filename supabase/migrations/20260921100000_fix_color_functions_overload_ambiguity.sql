-- ONIN: 20260918090000_characteristic_color_model.sql añadió p_color_id a
-- register_stock_movement, register_stock_transfer, reserve_stock, y
-- 20260918100000_profile_cut_color.sql añadió p_color_id/p_color_code/p_color_name
-- a execute_manual_dimensional_cut_with_work_sheet, todos vía `create or replace
-- function` con una lista de parámetros distinta a la anterior. Como cambia el
-- número de parámetros, eso NO reemplaza la función anterior: crea un segundo
-- overload huérfano que convive con el nuevo (mismo patrón de bug ya corregido
-- una vez para register_stock_movement en 20260828140000_component_consumption_
-- work_sheet.sql, que además queda reintroducido por esta cadena de migraciones
-- posteriores).
--
-- Cualquier llamada que no mencione los parámetros nuevos (color) —como la que
-- hace create_and_execute_component_consumption_work_sheet al descontar
-- componentes "sin característica", o el registro de movimiento DELIVERY en
-- process_sales_order_partial_delivery— es ambigua entre ambos overloads y
-- Postgres la rechaza con "function ... is not unique". Se retiran aquí los
-- cuatro overloads huérfanos, dejando solo la versión vigente con color.
drop function if exists public.register_stock_movement(bigint,bigint,bigint,numeric,varchar,bigint,varchar,text,timestamptz,uuid,jsonb);
drop function if exists public.register_stock_transfer(bigint,bigint,bigint,bigint,numeric,bigint,varchar,text,timestamptz);
drop function if exists public.reserve_stock(bigint,bigint,bigint,numeric,bigint,varchar,text);
drop function if exists public.execute_manual_dimensional_cut_with_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,numeric,jsonb,text,text);
