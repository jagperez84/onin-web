-- ONIN: materializa existencias dimensionales como piezas físicas y permite ejecutar cortes manuales.
insert into public.warehouse_stock_item
  (warehouse_stock_id, product_id, characteristic_id, quantity, dimension_values, status, parent_stock_item_id, source_stock_movement_id)
select ws.id, sm.product_id, sm.characteristic_id, 1,
  jsonb_build_array((sm.dimension_values->>sm.dimension_key)::numeric), 'AVAILABLE', null, sm.source_movement_id
from (
  select sm.company_id,sm.warehouse_id,sm.product_id,sm.characteristic_id,sm.dimension_values,
    (select key from jsonb_each(sm.dimension_values) where key ilike '%long%' or key ilike '%largo%' limit 1) as dimension_key,
    floor(sum(case when smt.direction=1 then sm.quantity else -sm.quantity end)) as available_quantity,
    min(sm.id) as source_movement_id
  from public.stock_movement sm
  join public.stock_movement_type smt on smt.id=sm.movement_type_id
  where sm.dimension_values is not null and jsonb_typeof(sm.dimension_values)='object' and sm.dimension_values<>'{}'::jsonb
  group by sm.company_id,sm.warehouse_id,sm.product_id,sm.characteristic_id,sm.dimension_values
  having floor(sum(case when smt.direction=1 then sm.quantity else -sm.quantity end))>0
) sm
join public.warehouse_stock ws on ws.warehouse_id=sm.warehouse_id and ws.product_id=sm.product_id and ws.characteristic_id is not distinct from sm.characteristic_id
cross join lateral generate_series(1,sm.available_quantity::integer) g
where sm.dimension_key is not null
  and not exists (select 1 from public.warehouse_stock_item existing where existing.warehouse_stock_id=ws.id and existing.product_id=sm.product_id and existing.characteristic_id is not distinct from sm.characteristic_id and existing.dimension_values=jsonb_build_array((sm.dimension_values->>sm.dimension_key)::numeric) and existing.status in ('AVAILABLE','RESERVED'));

create or replace function public.execute_manual_dimensional_cut(
  p_company_id bigint,p_product_id bigint,p_characteristic_id bigint,p_required_dimension_values jsonb,p_selections jsonb,
  p_reference varchar default null,p_notes text default null
) returns bigint language plpgsql security invoker as $$
declare
  v_product public.product%rowtype; v_family public.product_family%rowtype; v_reservation_id bigint;
  v_selection jsonb; v_item record; v_requested_quantity integer; v_allocated integer:=0; v_remaining numeric; v_total_requested integer;
begin
  if p_required_dimension_values is null or jsonb_typeof(p_required_dimension_values)<>'array' or jsonb_array_length(p_required_dimension_values)<>1 then raise exception 'El corte dimensional actual requiere un único eje dimensional'; end if;
  if (p_required_dimension_values->>0)::numeric<=0 then raise exception 'La dimensión solicitada debe ser mayor que cero'; end if;
  if p_selections is null or jsonb_typeof(p_selections)<>'array' or jsonb_array_length(p_selections)=0 then raise exception 'Debes seleccionar al menos una pieza de stock'; end if;
  select * into v_product from public.product where id=p_product_id and company_id=p_company_id and deleted_at is null and active=true;
  if not found then raise exception 'El artículo no existe o no está activo'; end if;
  if not v_product.stock_enabled or not v_product.include_measurements_in_stock then raise exception 'El artículo no tiene gestión de stock dimensional activa'; end if;
  if p_characteristic_id is not null then
    perform 1 from public.product_characteristic where id=p_characteristic_id and product_id=p_product_id and active=true and deleted_at is null;
    if not found then raise exception 'La característica no pertenece al artículo o no está activa'; end if;
  end if;
  if v_product.family_id is not null then select * into v_family from public.product_family where id=v_product.family_id and deleted_at is null; end if;
  if not coalesce(v_family.recuttable,false) then raise exception 'El artículo no está configurado como recortable'; end if;
  select coalesce(sum((s->>'quantity')::integer),0) into v_total_requested from jsonb_array_elements(p_selections) s;
  if v_total_requested<=0 then raise exception 'La cantidad seleccionada debe ser mayor que cero'; end if;
  insert into public.stock_reservation(company_id,warehouse_id,product_id,characteristic_id,quantity,reference,notes,status,dimension_values)
  values(p_company_id,((p_selections->0)->>'warehouse_id')::bigint,p_product_id,p_characteristic_id,v_total_requested,p_reference,p_notes,'ACTIVE',p_required_dimension_values)
  returning id into v_reservation_id;
  for v_selection in select value from jsonb_array_elements(p_selections) loop
    v_requested_quantity:=(v_selection->>'quantity')::integer;
    if v_requested_quantity<=0 then raise exception 'La cantidad seleccionada debe ser mayor que cero'; end if;
    for v_item in
      select wsi.id,wsi.warehouse_stock_id,wsi.product_id,wsi.characteristic_id,wsi.quantity,wsi.dimension_values
      from public.warehouse_stock_item wsi join public.warehouse_stock ws on ws.id=wsi.warehouse_stock_id
      where ws.warehouse_id=(v_selection->>'warehouse_id')::bigint and wsi.product_id=p_product_id and wsi.characteristic_id is not distinct from p_characteristic_id and wsi.status='AVAILABLE' and wsi.dimension_values=(v_selection->'dimension_values') and ((wsi.dimension_values->>0)::numeric>=(p_required_dimension_values->>0)::numeric)
      order by (wsi.dimension_values->>0)::numeric,wsi.id for update of wsi skip locked limit v_requested_quantity
    loop
      v_remaining:=(v_item.dimension_values->>0)::numeric-(p_required_dimension_values->>0)::numeric;
      insert into public.stock_reservation_item(reservation_id,stock_item_id,allocated_quantity,requested_dimension_values,remaining_dimension_values,status)
      values(v_reservation_id,v_item.id,1,p_required_dimension_values,case when v_remaining>0 then jsonb_build_array(v_remaining) else '[]'::jsonb end,'RESERVED');
      update public.warehouse_stock_item set status='RESERVED',updated_at=now() where id=v_item.id;
      update public.warehouse_stock set reserved_quantity=reserved_quantity+1,updated_at=now() where id=v_item.warehouse_stock_id;
      v_allocated:=v_allocated+1;
    end loop;
  end loop;
  if v_allocated<>v_total_requested then raise exception 'El stock seleccionado ya no está disponible. Se pudieron asignar % piezas de las solicitadas.',v_allocated; end if;
  perform public.consume_dimensional_stock_reservation(v_reservation_id);
  return v_reservation_id;
end; $$;

create or replace function public.consume_dimensional_stock_reservation(p_reservation_id bigint)
returns void language plpgsql security invoker as $$
declare
  v_res public.stock_reservation%rowtype; v_product public.product%rowtype; v_family public.product_family%rowtype;
  v_item record; v_stock public.warehouse_stock%rowtype; v_type public.stock_movement_type%rowtype;
  v_source_dims jsonb; v_remaining_dims jsonb; v_remaining numeric; v_minimum_remainder numeric:=0; v_recuttable boolean:=false; v_new_item_id bigint; v_movement_id bigint;
begin
  select * into v_res from public.stock_reservation where id=p_reservation_id for update;
  if not found then raise exception 'Reserva no encontrada'; end if;
  if v_res.status<>'ACTIVE' then return; end if;
  select * into v_product from public.product where id=v_res.product_id and deleted_at is null;
  if not found then raise exception 'El artículo de la reserva no existe'; end if;
  if v_product.family_id is not null then
    select * into v_family from public.product_family where id=v_product.family_id and deleted_at is null;
    if found then v_recuttable:=coalesce(v_family.recuttable,false); v_minimum_remainder:=coalesce(v_product.minimum_remainder,v_family.minimum_remainder,0); end if;
  end if;
  select * into v_type from public.stock_movement_type where company_id=v_res.company_id and code='DIMENSIONAL_CONSUMPTION' and active=true;
  if not found then raise exception 'No existe el tipo de movimiento DIMENSIONAL_CONSUMPTION'; end if;
  for v_item in
    select sri.id sri_id,sri.stock_item_id,sri.requested_dimension_values,sri.remaining_dimension_values,wsi.warehouse_stock_id,wsi.product_id,wsi.characteristic_id,wsi.dimension_values,wsi.status
    from public.stock_reservation_item sri join public.warehouse_stock_item wsi on wsi.id=sri.stock_item_id
    where sri.reservation_id=p_reservation_id and sri.status='RESERVED' for update of sri,wsi
  loop
    if v_item.status<>'RESERVED' then raise exception 'La existencia % ya no está reservada',v_item.stock_item_id; end if;
    v_source_dims:=v_item.dimension_values; v_remaining_dims:=v_item.remaining_dimension_values;
    select * into v_stock from public.warehouse_stock where id=v_item.warehouse_stock_id for update;
    if not found then raise exception 'No existe el saldo agregado del stock %',v_item.warehouse_stock_id; end if;
    insert into public.stock_movement(company_id,warehouse_id,product_id,movement_type_id,characteristic_id,quantity,movement_date,reference,notes,dimension_values)
    values(v_res.company_id,v_res.warehouse_id,v_res.product_id,v_type.id,v_res.characteristic_id,1,now(),v_res.reference,coalesce(v_res.notes,'Consumo dimensional'),jsonb_build_object('LONGITUD',(v_source_dims->>0)::numeric)) returning id into v_movement_id;
    update public.warehouse_stock_item set status='CONSUMED',updated_at=now(),source_stock_movement_id=v_movement_id where id=v_item.stock_item_id;
    update public.warehouse_stock set quantity=greatest(0,quantity-1),reserved_quantity=greatest(0,reserved_quantity-1),updated_at=now() where id=v_item.warehouse_stock_id;
    if v_recuttable and jsonb_array_length(v_remaining_dims)=1 then
      v_remaining:=(v_remaining_dims->>0)::numeric;
      if v_remaining>=v_minimum_remainder and v_remaining>0 then
        insert into public.warehouse_stock_item(warehouse_stock_id,product_id,characteristic_id,quantity,dimension_values,status,parent_stock_item_id,source_stock_movement_id)
        values(v_item.warehouse_stock_id,v_item.product_id,v_item.characteristic_id,1,v_remaining_dims,'AVAILABLE',v_item.stock_item_id,null) returning id into v_new_item_id;
        select * into v_type from public.stock_movement_type where company_id=v_res.company_id and code='DIMENSIONAL_REMNANT' and active=true;
        if not found then raise exception 'No existe el tipo de movimiento DIMENSIONAL_REMNANT'; end if;
        insert into public.stock_movement(company_id,warehouse_id,product_id,movement_type_id,characteristic_id,quantity,movement_date,reference,notes,dimension_values)
        values(v_res.company_id,v_res.warehouse_id,v_res.product_id,v_type.id,v_res.characteristic_id,1,now(),v_res.reference,format('Remanente de %s',v_item.stock_item_id),jsonb_build_object('LONGITUD',v_remaining)) returning id into v_movement_id;
        update public.warehouse_stock_item set source_stock_movement_id=v_movement_id where id=v_new_item_id;
        update public.warehouse_stock set quantity=quantity+1,updated_at=now() where id=v_item.warehouse_stock_id;
      else
        select * into v_type from public.stock_movement_type where company_id=v_res.company_id and code='DIMENSIONAL_SCRAP' and active=true;
        if not found then raise exception 'No existe el tipo de movimiento DIMENSIONAL_SCRAP'; end if;
        insert into public.stock_movement(company_id,warehouse_id,product_id,movement_type_id,characteristic_id,quantity,movement_date,reference,notes,dimension_values)
        values(v_res.company_id,v_res.warehouse_id,v_res.product_id,v_type.id,v_res.characteristic_id,1,now(),v_res.reference,format('Scrap de remanente de %s',v_item.stock_item_id),jsonb_build_object('LONGITUD',v_remaining));
      end if;
    end if;
    update public.stock_reservation_item set status='CONSUMED',consumed_at=now(),updated_at=now() where id=v_item.sri_id;
  end loop;
  update public.stock_reservation set status='CONSUMED',updated_at=now() where id=p_reservation_id;
end; $$;