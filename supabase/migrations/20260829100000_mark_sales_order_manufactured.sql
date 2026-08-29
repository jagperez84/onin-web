-- ONIN: transición de estado del pedido a "Fabricado" (MANUFACTURED).
--
-- La decisión de CUÁNDO un pedido está completamente fabricado (todas sus líneas
-- cortadas/confeccionadas/con componentes descontados según lo que cada una
-- necesite) depende de leer el despiece (BOM/OTD) de cada línea, que hoy solo se
-- interpreta en TypeScript (isProfileComponent/isFabricOrLonaComponent/
-- resolveOrderLineComponents). Replicar esa heurística en PL/pgSQL duplicaría
-- lógica frágil en dos sitios, así que la comprobación de "¿está todo hecho?"
-- se hace en el cliente (checkAndMarkOrderManufactured) tras cada acción de
-- fabricación — línea a línea o desde "Fabricar pedido completo" — y esta
-- función solo aplica el cambio de estado, de forma idempotente y protegida
-- para no pisar un pedido ya instalado o cancelado.

create or replace function public.mark_sales_order_manufactured(p_sales_order_id bigint)
returns void
language plpgsql
security invoker
as $$
begin
  update public.sales_order
     set status = 'MANUFACTURED', updated_at = now()
   where id = p_sales_order_id
     and status not in ('MANUFACTURED', 'INSTALLED', 'CANCELLED');
end;
$$;

grant execute on function public.mark_sales_order_manufactured(bigint) to authenticated;
