-- El motor de stock (warehouse_stock/_item, stock_movement, stock_reservation,
-- production_work_sheet) validaba characteristic_id/color_id contra
-- product_characteristic + characteristic_color, el mismo sistema que resultó
-- muerto en el editor de OTD (20260921140000_otd_component_characteristic_uses_
-- attribute.sql): su única pantalla de alta (ProductCharacteristics.tsx) no está
-- enlazada desde ningún sitio de la app, así que desde la UI ningún artículo
-- pudo tener nunca una fila de product_characteristic nueva, y
-- validate_characteristic_color bloqueaba cualquier color_id real porque exigía
-- primero un characteristic_id válido que la UI nunca podía crear.
--
-- Eso no significa que la columna esté vacía: 20260831204725_multi_company_demo_v8.sql
-- replica product_characteristic y warehouse_stock/stock_movement/... de la
-- empresa real a la demo, así que SÍ hay filas de stock con characteristic_id
-- apuntando a product_characteristic ya en producción (datos reales, no basura;
-- probablemente cargados por SQL/import directo en su momento, no por esta
-- pantalla). No se tocan ni se pierden: el paso 4 de abajo repunta la FK a
-- product_attribute solo en las tablas donde todo el characteristic_id
-- existente ya encaja; donde no encaja dejamos la columna sin FK (sigue
-- guardando el valor tal cual) en vez de fallar o anular datos ajenos.
--
-- El sistema real y accesible para dar de alta una característica nueva es
-- product_attribute (herencia de familia + asignación de artículo, colores vía
-- attribute_color) — el mismo repuntado ya hecho para otd_component. Este
-- archivo repite el mismo cambio para el motor de stock:
--   1. effective_product_characteristics(product_id): fusión en SQL (familia +
--      asignación de artículo + exclusiones) equivalente a
--      loadEffectiveCharacteristicsForProducts en TS.
--   2. validate_characteristic_color gana p_product_id y valida contra
--      attribute_color (con las exclusiones de familia/artículo) en vez de
--      characteristic_color.
--   3. register_stock_movement / reserve_stock / reserve_dimensional_stock /
--      execute_manual_dimensional_cut: la comprobación "la característica
--      pertenece al artículo" pasa a mirar product_attribute en vez de
--      product_characteristic. De paso, reserve_stock y reserve_dimensional_stock
--      ganan la misma excepción que ya tenía register_stock_movement
--      (v_has_characteristics): un artículo con "gestionar stock por color"
--      activado pero sin ninguna característica configurada ya no bloquea la
--      reserva — antes reserve_stock no tenía esa excepción y cualquier
--      artículo con ese flag no podía reservarse nunca.
--   4. Las FK characteristic_id de warehouse_stock, warehouse_stock_item,
--      stock_movement, stock_reservation y production_work_sheet pasan de
--      product_characteristic(id) a product_attribute(id) — solo donde los
--      datos existentes ya lo permiten (ver arriba); en el resto queda como
--      aviso (raise notice) para revisar manualmente cuándo/si conviene migrar
--      esas filas concretas a una característica product_attribute real.
--
-- Las filas con un characteristic_id "viejo" (product_characteristic) siguen
-- funcionando para sus propios movimientos futuros: register_stock_movement
-- etc. rechazará ese characteristic_id por RPC (ya no es válido contra
-- product_attribute), pero el fallback de registerStockMovement en
-- stockRepository.ts ya hace un insert directo sin pasar por el RPC cuando la
-- validación de característica falla, así que el movimiento no se bloquea.

-- 1. Fusión efectiva de características (family + article + exclusiones), igual
-- criterio que listProductCharacteristicConfiguration/listEffectiveAttributeColors.
create or replace function public.effective_product_characteristics(p_product_id bigint)
returns table(attribute_id bigint, source text, assignment_id bigint)
language sql
stable
security invoker
as $$
  select paa.attribute_id, 'article'::text, paa.id
  from public.product_attribute_assignment paa
  where paa.product_id = p_product_id
    and paa.active = true
    and paa.deleted_at is null
  union all
  select pfa.attribute_id, 'family'::text, pfa.id
  from public.product p
  join public.product_family_attribute pfa on pfa.family_id = p.family_id
  where p.id = p_product_id
    and pfa.active = true
    and pfa.deleted_at is null
    and not exists (
      select 1 from public.product_family_attribute_exclusion x
      where x.product_id = p_product_id and x.attribute_id = pfa.attribute_id
    )
    and not exists (
      select 1 from public.product_attribute_assignment paa2
      where paa2.product_id = p_product_id and paa2.attribute_id = pfa.attribute_id
        and paa2.active = true and paa2.deleted_at is null
    );
$$;

-- 2. validate_characteristic_color: 2 parámetros -> 3 (necesita product_id para
-- resolver family/article). create or replace no sustituye una función con
-- distinto número de parámetros (deja un overload huérfano, el mismo bug ya
-- corregido en 20260921100000_fix_color_functions_overload_ambiguity.sql), así
-- que se elimina la versión antigua explícitamente.
drop function if exists public.validate_characteristic_color(bigint, bigint);

create or replace function public.validate_characteristic_color(
  p_product_id bigint,
  p_characteristic_id bigint,
  p_color_id bigint
)
returns void
language plpgsql
security invoker
as $$
declare
  v_source text;
  v_assignment_id bigint;
begin
  if p_color_id is null then
    return;
  end if;
  if p_characteristic_id is null then
    raise exception 'No se puede indicar color sin indicar característica';
  end if;
  select epc.source, epc.assignment_id into v_source, v_assignment_id
    from public.effective_product_characteristics(p_product_id) epc
    where epc.attribute_id = p_characteristic_id
    limit 1;
  if v_source is null then
    raise exception 'La característica no pertenece al artículo o no está activa';
  end if;
  perform 1 from public.attribute_color ac
    where ac.attribute_id = p_characteristic_id
      and ac.color_id = p_color_id
      and ac.deleted_at is null
      and not exists (
        select 1 from public.product_family_attribute_color_exclusion x
        where v_source = 'family' and x.family_attribute_id = v_assignment_id and x.color_id = p_color_id
      )
      and not exists (
        select 1 from public.product_attribute_assignment_color_exclusion x
        where v_source = 'article' and x.assignment_id = v_assignment_id and x.color_id = p_color_id
      );
  if not found then
    raise exception 'El color no está asociado a la característica indicada';
  end if;
end;
$$;

-- 3a. register_stock_movement (mismos 12 parámetros, solo cambia el origen de
-- las comprobaciones de característica/color).
create or replace function public.register_stock_movement(
  p_company_id bigint,
  p_warehouse_id bigint,
  p_product_id bigint,
  p_quantity numeric,
  p_movement_type_code character varying,
  p_characteristic_id bigint default null,
  p_reference character varying default null,
  p_notes text default null,
  p_movement_date timestamp with time zone default now(),
  p_transfer_group_id uuid default null,
  p_dimension_values jsonb default null,
  p_color_id bigint default null
)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_product public.product%rowtype;
  v_warehouse public.warehouse%rowtype;
  v_type public.stock_movement_type%rowtype;
  v_stock public.warehouse_stock%rowtype;
  v_has_characteristics boolean;
  v_signed numeric;
  v_movement_id bigint;
  v_dimension_array jsonb := '[]'::jsonb;
  v_dimension_units jsonb := '[]'::jsonb;
  v_dimension_count integer := 0;
  v_measurement_type_id bigint;
  v_item_quantity integer;
  v_item_index integer;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  select * into v_product from public.product where id=p_product_id and company_id=p_company_id and deleted_at is null;
  if not found then raise exception 'El artículo no existe para la empresa indicada'; end if;
  if not v_product.stock_enabled then raise exception 'El artículo % no tiene la gestión de stock activada',v_product.code; end if;
  select * into v_warehouse from public.warehouse where id=p_warehouse_id and company_id=p_company_id and deleted_at is null;
  if not found then raise exception 'El almacén no existe para la empresa indicada'; end if;
  if not v_warehouse.active then raise exception 'El almacén está inactivo'; end if;
  select * into v_type from public.stock_movement_type where company_id=p_company_id and code=p_movement_type_code and active=true;
  if not found then raise exception 'Tipo de movimiento no válido: %',p_movement_type_code; end if;
  select exists(select 1 from public.effective_product_characteristics(p_product_id)) into v_has_characteristics;
  if p_characteristic_id is not null then
    if not exists (select 1 from public.effective_product_characteristics(p_product_id) epc where epc.attribute_id = p_characteristic_id) then
      raise exception 'La característica no pertenece al artículo o no está activa';
    end if;
  elsif v_product.include_stock_by_color and v_has_characteristics then
    raise exception 'El artículo requiere característica para gestionar stock por color';
  end if;
  perform public.validate_characteristic_color(p_product_id, p_characteristic_id, p_color_id);
  if p_dimension_values is not null and jsonb_typeof(p_dimension_values)='object' and (select count(*) from jsonb_each(p_dimension_values))>0 then
    v_measurement_type_id:=v_product.measurement_type_id;
    if v_measurement_type_id is null and v_product.family_id is not null then
      select pf.measurement_type_id into v_measurement_type_id from public.product_family pf where pf.id=v_product.family_id and pf.deleted_at is null;
    end if;
    if v_measurement_type_id is not null then
      select coalesce(jsonb_agg(case when p_dimension_values ? mtd.code then to_jsonb((p_dimension_values->>mtd.code)::numeric) else 'null'::jsonb end order by mtd.dimension_number),'[]'::jsonb), coalesce(jsonb_agg(coalesce(u.code,u.name) order by mtd.dimension_number),'[]'::jsonb), count(*) into v_dimension_array,v_dimension_units,v_dimension_count
      from public.measurement_type_dimension mtd left join public.unit u on u.id=mtd.unit_id where mtd.measurement_type_id=v_measurement_type_id;
    end if;
    if v_dimension_count=0 then
      select coalesce(jsonb_agg(to_jsonb(value)),'[]'::jsonb) into v_dimension_array from jsonb_each_text(p_dimension_values) as e(key,value);
      v_dimension_units:='[]'::jsonb;
    end if;
  end if;
  v_signed:=p_quantity*(v_type.direction);
  select * into v_stock from public.warehouse_stock where warehouse_id=p_warehouse_id and product_id=p_product_id and characteristic_id is not distinct from p_characteristic_id and color_id is not distinct from p_color_id for update;
  if not found then
    insert into public.warehouse_stock(warehouse_id,product_id,characteristic_id,color_id,quantity,reserved_quantity) values(p_warehouse_id,p_product_id,p_characteristic_id,p_color_id,0,0) returning * into v_stock;
  end if;
  if v_signed<0 and not v_product.allow_negative_stock and (v_stock.quantity+v_signed)<0 then raise exception 'Stock insuficiente. Disponible físico: %',v_stock.quantity; end if;
  update public.warehouse_stock set quantity=quantity+v_signed,updated_at=now() where id=v_stock.id;
  insert into public.stock_movement(company_id,warehouse_id,product_id,movement_type_id,characteristic_id,color_id,quantity,movement_date,reference,notes,transfer_group_id,dimension_values,dimension_units)
  values(p_company_id,p_warehouse_id,p_product_id,v_type.id,p_characteristic_id,p_color_id,p_quantity,p_movement_date,p_reference,p_notes,p_transfer_group_id,case when jsonb_array_length(v_dimension_array)>0 then v_dimension_array else coalesce(p_dimension_values,'[]'::jsonb) end,v_dimension_units)
  returning id into v_movement_id;
  if v_signed>0 and jsonb_array_length(v_dimension_array)>0 and coalesce(v_product.include_measurements_in_stock,false) then
    if p_quantity<>trunc(p_quantity) then raise exception 'El stock dimensional se registra por piezas físicas completas'; end if;
    v_item_quantity:=trunc(p_quantity)::integer;
    for v_item_index in 1..v_item_quantity loop
      insert into public.warehouse_stock_item(warehouse_stock_id,product_id,characteristic_id,color_id,quantity,dimension_values,dimension_units,status,source_stock_movement_id)
      values(v_stock.id,p_product_id,p_characteristic_id,p_color_id,1,v_dimension_array,v_dimension_units,'AVAILABLE',v_movement_id);
    end loop;
  end if;
  return v_movement_id;
end;
$$;

-- 3b. reserve_stock (mismos 8 parámetros): además de repuntar la comprobación de
-- característica, gana v_has_characteristics para no bloquear artículos con
-- "stock por color" activado pero sin ninguna característica configurada —
-- antes no tenía esa excepción y por eso siempre fallaba para esos artículos.
create or replace function public.reserve_stock(
  p_company_id bigint,
  p_warehouse_id bigint,
  p_product_id bigint,
  p_quantity numeric,
  p_characteristic_id bigint default null,
  p_reference character varying default null,
  p_notes text default null,
  p_color_id bigint default null
) returns bigint
language plpgsql security invoker as $$
declare
  v_product public.product%rowtype;
  v_warehouse public.warehouse%rowtype;
  v_stock public.warehouse_stock%rowtype;
  v_has_characteristics boolean;
  v_id bigint;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad a reservar debe ser mayor que cero'; end if;
  select * into v_product from public.product where id=p_product_id and company_id=p_company_id and deleted_at is null;
  if not found then raise exception 'El artículo no existe'; end if;
  if not v_product.stock_enabled then raise exception 'El artículo no tiene la gestión de stock activada'; end if;
  select * into v_warehouse from public.warehouse where id=p_warehouse_id and company_id=p_company_id and deleted_at is null and active=true;
  if not found then raise exception 'El almacén no existe o está inactivo'; end if;
  select exists(select 1 from public.effective_product_characteristics(p_product_id)) into v_has_characteristics;
  if p_characteristic_id is not null then
    if not exists (select 1 from public.effective_product_characteristics(p_product_id) epc where epc.attribute_id = p_characteristic_id) then
      raise exception 'Característica no válida para el artículo';
    end if;
  elsif v_product.include_stock_by_color and v_has_characteristics then
    raise exception 'El artículo requiere característica para reservar stock';
  end if;
  perform public.validate_characteristic_color(p_product_id, p_characteristic_id, p_color_id);
  select * into v_stock from public.warehouse_stock where warehouse_id=p_warehouse_id and product_id=p_product_id and characteristic_id is not distinct from p_characteristic_id and color_id is not distinct from p_color_id for update;
  if not found then
    insert into public.warehouse_stock (warehouse_id,product_id,characteristic_id,color_id,quantity,reserved_quantity) values (p_warehouse_id,p_product_id,p_characteristic_id,p_color_id,0,0) returning * into v_stock;
  end if;
  if (v_stock.quantity-v_stock.reserved_quantity)<p_quantity and not v_product.allow_negative_stock then
    raise exception 'Stock disponible insuficiente. Disponible: %',(v_stock.quantity-v_stock.reserved_quantity);
  end if;
  update public.warehouse_stock set reserved_quantity=reserved_quantity+p_quantity,updated_at=now() where id=v_stock.id;
  insert into public.stock_reservation (company_id,warehouse_id,product_id,characteristic_id,color_id,quantity,reference,notes) values (p_company_id,p_warehouse_id,p_product_id,p_characteristic_id,p_color_id,p_quantity,p_reference,p_notes) returning id into v_id;
  return v_id;
end;
$$;

-- 3c. reserve_dimensional_stock (mismos 9 parámetros): misma relajación que
-- reserve_stock para "stock por color" sin características configuradas.
create or replace function public.reserve_dimensional_stock(
  p_company_id bigint,
  p_warehouse_id bigint,
  p_product_id bigint,
  p_quantity numeric,
  p_characteristic_id bigint default null,
  p_dimension_values jsonb default '[]'::jsonb,
  p_reference character varying default null,
  p_notes text default null,
  p_color_id bigint default null
) returns bigint
language plpgsql
security invoker
as $$
declare
  v_product public.product%rowtype;
  v_family public.product_family%rowtype;
  v_has_characteristics boolean;
  v_reservation_id bigint;
  v_needed integer;
  v_allocated integer := 0;
  v_item record;
  v_source_dims jsonb;
  v_source_len numeric;
  v_requested_len numeric;
  v_remaining numeric;
  v_recuttable boolean := false;
  v_minimum_remainder numeric := 0;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad a reservar debe ser mayor que cero'; end if;
  if p_dimension_values is null or jsonb_typeof(p_dimension_values) <> 'array' then raise exception 'Las dimensiones solicitadas deben ser un array JSON'; end if;

  select * into v_product from public.product where id=p_product_id and company_id=p_company_id and deleted_at is null and active=true;
  if not found then raise exception 'El artículo no existe o no está activo'; end if;
  if not v_product.stock_enabled then raise exception 'El artículo no tiene la gestión de stock activada'; end if;
  if not v_product.include_measurements_in_stock then raise exception 'El artículo no tiene activado el control de stock dimensional'; end if;

  if v_product.family_id is not null then
    select * into v_family from public.product_family where id=v_product.family_id and deleted_at is null;
    if found then
      v_recuttable := coalesce(v_family.recuttable,false);
      v_minimum_remainder := coalesce(v_product.minimum_remainder,v_family.minimum_remainder,0);
    end if;
  end if;

  select exists(select 1 from public.effective_product_characteristics(p_product_id)) into v_has_characteristics;
  if p_characteristic_id is not null then
    if not exists (select 1 from public.effective_product_characteristics(p_product_id) epc where epc.attribute_id = p_characteristic_id) then
      raise exception 'La característica no pertenece al artículo o no está activa';
    end if;
  elsif v_product.include_stock_by_color and v_has_characteristics then
    raise exception 'El artículo requiere característica para reservar stock dimensional';
  end if;
  perform public.validate_characteristic_color(p_product_id, p_characteristic_id, p_color_id);

  if v_recuttable then
    if jsonb_array_length(p_dimension_values) <> 1 then
      raise exception 'El corte automático de remanentes requiere actualmente un único eje dimensional. Las piezas multidimensionales requieren una regla de corte específica';
    end if;
    v_requested_len := (p_dimension_values->>0)::numeric;
    if v_requested_len <= 0 then raise exception 'La dimensión solicitada debe ser mayor que cero'; end if;
  end if;

  v_needed := ceil(p_quantity);
  if p_quantity <> v_needed then raise exception 'El stock dimensional se reserva por piezas físicas completas'; end if;

  insert into public.stock_reservation(company_id,warehouse_id,product_id,characteristic_id,color_id,quantity,reference,notes,status,dimension_values)
  values(p_company_id,p_warehouse_id,p_product_id,p_characteristic_id,p_color_id,p_quantity,p_reference,p_notes,'ACTIVE',p_dimension_values)
  returning id into v_reservation_id;

  if v_recuttable then
    for v_item in
      select wsi.id,wsi.warehouse_stock_id,wsi.product_id,wsi.characteristic_id,wsi.quantity,wsi.dimension_values
      from public.warehouse_stock_item wsi
      join public.warehouse_stock ws on ws.id=wsi.warehouse_stock_id
      where ws.warehouse_id=p_warehouse_id
        and wsi.product_id=p_product_id
        and wsi.characteristic_id is not distinct from p_characteristic_id
        and wsi.color_id is not distinct from p_color_id
        and wsi.status='AVAILABLE'
        and jsonb_array_length(wsi.dimension_values)=1
        and (wsi.dimension_values->>0)::numeric >= v_requested_len
      order by (wsi.dimension_values->>0)::numeric asc,wsi.id
      for update of wsi skip locked
      limit v_needed
    loop
      v_source_dims := v_item.dimension_values;
      v_source_len := (v_source_dims->>0)::numeric;
      v_remaining := v_source_len-v_requested_len;
      insert into public.stock_reservation_item(reservation_id,stock_item_id,allocated_quantity,requested_dimension_values,remaining_dimension_values,status)
      values(v_reservation_id,v_item.id,1,p_dimension_values,case when v_remaining>0 then jsonb_build_array(v_remaining) else '[]'::jsonb end,'RESERVED');
      update public.warehouse_stock_item set status='RESERVED',updated_at=now() where id=v_item.id;
      update public.warehouse_stock set reserved_quantity=reserved_quantity+1,updated_at=now() where id=v_item.warehouse_stock_id;
      v_allocated := v_allocated+1;
    end loop;
  else
    for v_item in
      select wsi.id,wsi.warehouse_stock_id,wsi.product_id,wsi.characteristic_id,wsi.quantity,wsi.dimension_values
      from public.warehouse_stock_item wsi
      join public.warehouse_stock ws on ws.id=wsi.warehouse_stock_id
      where ws.warehouse_id=p_warehouse_id
        and wsi.product_id=p_product_id
        and wsi.characteristic_id is not distinct from p_characteristic_id
        and wsi.color_id is not distinct from p_color_id
        and wsi.status='AVAILABLE'
        and wsi.dimension_values = p_dimension_values
      order by wsi.id
      for update of wsi skip locked
      limit v_needed
    loop
      insert into public.stock_reservation_item(reservation_id,stock_item_id,allocated_quantity,requested_dimension_values,remaining_dimension_values,status)
      values(v_reservation_id,v_item.id,1,p_dimension_values,'[]'::jsonb,'RESERVED');
      update public.warehouse_stock_item set status='RESERVED',updated_at=now() where id=v_item.id;
      update public.warehouse_stock set reserved_quantity=reserved_quantity+1,updated_at=now() where id=v_item.warehouse_stock_id;
      v_allocated := v_allocated+1;
    end loop;
  end if;

  if v_allocated < v_needed then
    update public.warehouse_stock_item wsi
      set status='AVAILABLE',updated_at=now()
      where wsi.id in (select sri.stock_item_id from public.stock_reservation_item sri where sri.reservation_id=v_reservation_id);
    update public.warehouse_stock ws
      set reserved_quantity=greatest(0,ws.reserved_quantity-v_allocated),updated_at=now()
      where ws.id in (select wsi.warehouse_stock_id from public.warehouse_stock_item wsi join public.stock_reservation_item sri on sri.stock_item_id=wsi.id where sri.reservation_id=v_reservation_id);
    delete from public.stock_reservation_item where reservation_id=v_reservation_id;
    update public.stock_reservation set status='RELEASED',updated_at=now() where id=v_reservation_id;
    raise exception 'Stock dimensional insuficiente. Solicitadas: %, asignadas: %',v_needed,v_allocated;
  end if;

  return v_reservation_id;
end;
$$;

-- 3d. execute_manual_dimensional_cut (mismos 8 parámetros): repunta la
-- comprobación de característica; no tenía relajación de include_stock_by_color
-- que tocar (no existía en esta función).
create or replace function public.execute_manual_dimensional_cut(
  p_company_id bigint,p_product_id bigint,p_characteristic_id bigint,p_required_dimension_values jsonb,p_selections jsonb,
  p_reference character varying default null,p_notes text default null,p_color_id bigint default null
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
    if not exists (select 1 from public.effective_product_characteristics(p_product_id) epc where epc.attribute_id = p_characteristic_id) then
      raise exception 'La característica no pertenece al artículo o no está activa';
    end if;
  end if;
  perform public.validate_characteristic_color(p_product_id, p_characteristic_id, p_color_id);
  if v_product.family_id is not null then select * into v_family from public.product_family where id=v_product.family_id and deleted_at is null; end if;
  if not coalesce(v_family.recuttable,false) then raise exception 'El artículo no está configurado como recortable'; end if;
  select coalesce(sum((s->>'quantity')::integer),0) into v_total_requested from jsonb_array_elements(p_selections) s;
  if v_total_requested<=0 then raise exception 'La cantidad seleccionada debe ser mayor que cero'; end if;
  insert into public.stock_reservation(company_id,warehouse_id,product_id,characteristic_id,color_id,quantity,reference,notes,status,dimension_values)
  values(p_company_id,((p_selections->0)->>'warehouse_id')::bigint,p_product_id,p_characteristic_id,p_color_id,v_total_requested,p_reference,p_notes,'ACTIVE',p_required_dimension_values)
  returning id into v_reservation_id;
  for v_selection in select value from jsonb_array_elements(p_selections) loop
    v_requested_quantity:=(v_selection->>'quantity')::integer;
    if v_requested_quantity<=0 then raise exception 'La cantidad seleccionada debe ser mayor que cero'; end if;
    for v_item in
      select wsi.id,wsi.warehouse_stock_id,wsi.product_id,wsi.characteristic_id,wsi.quantity,wsi.dimension_values
      from public.warehouse_stock_item wsi join public.warehouse_stock ws on ws.id=wsi.warehouse_stock_id
      where ws.warehouse_id=(v_selection->>'warehouse_id')::bigint and wsi.product_id=p_product_id and wsi.characteristic_id is not distinct from p_characteristic_id and wsi.color_id is not distinct from p_color_id and wsi.status='AVAILABLE' and wsi.dimension_values=(v_selection->'dimension_values') and ((wsi.dimension_values->>0)::numeric>=(p_required_dimension_values->>0)::numeric)
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

-- 4. Repunta las FK characteristic_id de product_characteristic a
-- product_attribute en las tablas de stock/producción — pero solo donde los
-- datos existentes ya encajan. Hay filas reales (ver justificación arriba)
-- con characteristic_id de la vieja product_characteristic; forzar la FK ahí
-- fallaría (o, peor, habría que anular ese dato para poder forzarla). Por
-- tabla: se quita siempre la FK vieja a product_characteristic si existe: ese
-- valor deja de tener integridad referencial garantizada por la base de
-- datos, pero el dato en sí no se toca. La FK nueva a product_attribute solo
-- se añade si NINGÚN characteristic_id existente en esa tabla la
-- incumpliría; si alguno la incumple, se deja sin FK (con un aviso) en vez de
-- fallar — la validación de negocio real ya la hacen register_stock_movement/
-- reserve_stock/etc. contra product_attribute para cualquier movimiento
-- nuevo, así que la ausencia de esta FK no abre ninguna vía nueva de
-- inconsistencia; solo dilata la limpieza de esas filas concretas a cuando el
-- usuario decida revisarlas manualmente.
do $$
declare
  v_table text;
  v_conname text;
  v_incompatible integer;
begin
  foreach v_table in array array['warehouse_stock','warehouse_stock_item','stock_movement','stock_reservation','production_work_sheet']
  loop
    select c.conname into v_conname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.conrelid = format('public.%I', v_table)::regclass
      and c.contype = 'f'
      and array_length(c.conkey,1) = 1
      and a.attname = 'characteristic_id'
      and c.confrelid = 'public.product_characteristic'::regclass;
    if v_conname is not null then
      execute format('alter table public.%I drop constraint %I', v_table, v_conname);
    end if;

    execute format(
      'select count(*) from public.%I t where t.characteristic_id is not null and not exists (select 1 from public.product_attribute pa where pa.id = t.characteristic_id)',
      v_table
    ) into v_incompatible;

    if v_incompatible > 0 then
      raise notice 'Sin FK nueva characteristic_id -> product_attribute en %: % fila(s) con characteristic_id todavía del antiguo product_characteristic. El dato no se toca; revísalas manualmente cuando convenga y vuelve a lanzar este bloque para forzar la restricción.', v_table, v_incompatible;
    elsif not exists (
      select 1
      from pg_constraint c
      where c.conrelid = format('public.%I', v_table)::regclass
        and c.contype = 'f'
        and c.confrelid = 'public.product_attribute'::regclass
        and array_length(c.conkey,1) = 1
        and c.conkey[1] = (
          select attnum from pg_attribute
          where attrelid = format('public.%I', v_table)::regclass and attname = 'characteristic_id'
        )
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (characteristic_id) references public.product_attribute(id)',
        v_table, v_table || '_characteristic_id_fkey'
      );
    end if;
  end loop;
end $$;

comment on column public.warehouse_stock.characteristic_id is 'Característica (product_attribute.id, familia o artículo) de esta partida de stock. NULL si el artículo no diferencia por característica. Filas anteriores a 20260921150000 pueden conservar un id del antiguo product_characteristic sin FK (ver esa migración).';
comment on column public.warehouse_stock_item.characteristic_id is 'Característica (product_attribute.id) de esta pieza física. NULL si el artículo no diferencia por característica. Filas anteriores a 20260921150000 pueden conservar un id del antiguo product_characteristic sin FK (ver esa migración).';
comment on column public.stock_movement.characteristic_id is 'Característica (product_attribute.id) afectada por el movimiento. NULL si el artículo no diferencia por característica. Filas anteriores a 20260921150000 pueden conservar un id del antiguo product_characteristic sin FK (ver esa migración).';
comment on column public.stock_reservation.characteristic_id is 'Característica (product_attribute.id) reservada. NULL si el artículo no diferencia por característica. Filas anteriores a 20260921150000 pueden conservar un id del antiguo product_characteristic sin FK (ver esa migración).';
comment on column public.production_work_sheet.characteristic_id is 'Característica (product_attribute.id) del artículo cortado/consumido. NULL si el artículo no diferencia por característica. Filas anteriores a 20260921150000 pueden conservar un id del antiguo product_characteristic sin FK (ver esa migración).';
