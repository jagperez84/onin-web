-- consume_stock_reservation (reserva NO dimensional, botón "Consumir reserva" de
-- Almacén > Reservas) solo liberaba reserved_quantity y marcaba la reserva CONSUMED —
-- a diferencia de su homólogo dimensional consume_dimensional_stock_reservation, nunca
-- descontaba warehouse_stock.quantity ni generaba un stock_movement. El saldo físico
-- quedaba permanentemente desincronizado: la reserva desaparecía como "consumida" pero
-- el material seguía contando como stock disponible.
insert into public.stock_movement_type (company_id, code, name, direction, active)
select c.id, 'RESERVATION_CONSUMPTION', 'Consumo de reserva de stock', -1, true
from public.company c
where not exists (
  select 1 from public.stock_movement_type t
  where t.company_id = c.id and t.code = 'RESERVATION_CONSUMPTION'
);

create or replace function public.consume_stock_reservation(p_reservation_id bigint) returns void language plpgsql security invoker as $$
declare
  v_res public.stock_reservation%rowtype;
  v_type public.stock_movement_type%rowtype;
begin
  select * into v_res from public.stock_reservation where id=p_reservation_id for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  if v_res.status<>'ACTIVE' then return; end if;

  select * into v_type from public.stock_movement_type where company_id=v_res.company_id and code='RESERVATION_CONSUMPTION' and active=true;
  if not found then raise exception 'No existe el tipo de movimiento RESERVATION_CONSUMPTION'; end if;

  update public.warehouse_stock
    set quantity=greatest(0,quantity-v_res.quantity),
        reserved_quantity=greatest(0,reserved_quantity-v_res.quantity),
        updated_at=now()
  where warehouse_id=v_res.warehouse_id and product_id=v_res.product_id
    and characteristic_id is not distinct from v_res.characteristic_id
    and color_id is not distinct from v_res.color_id;

  insert into public.stock_movement (company_id,warehouse_id,product_id,movement_type_id,characteristic_id,color_id,quantity,movement_date,reference,notes)
  values (v_res.company_id,v_res.warehouse_id,v_res.product_id,v_type.id,v_res.characteristic_id,v_res.color_id,v_res.quantity,now(),v_res.reference,coalesce(v_res.notes,'Consumo de reserva'));

  update public.stock_reservation set status='CONSUMED',updated_at=now() where id=p_reservation_id;
end;
$$;
