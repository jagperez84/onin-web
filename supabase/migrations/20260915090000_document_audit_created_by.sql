-- Auditoría: qué usuario realizó cada acción del ciclo de venta.
--
-- Ninguna de las tablas de documentos transaccionales (presupuesto, pedido,
-- hoja de producción, montaje, albarán, factura) guardaba quién la generó —
-- solo measurement/measurement_activity lo hacían, con created_by uuid sin
-- FK (auth.uid() directo, resuelto en el cliente con user_account.auth_user_id
-- vía coreRepository.getUserDisplayName). Se aplica el mismo patrón aquí, sin
-- inventar uno nuevo: created_by uuid en cada tabla, y completed_by en
-- installation para distinguir quién programó el montaje de quién lo
-- completó (puede ser otra persona).

alter table public.quotation add column if not exists created_by uuid;
alter table public.sales_order add column if not exists created_by uuid;
alter table public.production_work_sheet add column if not exists created_by uuid;
alter table public.delivery_note add column if not exists created_by uuid;
alter table public.invoice add column if not exists created_by uuid;
alter table public.installation add column if not exists created_by uuid;
alter table public.installation add column if not exists completed_by uuid;

-- Pedido creado desde presupuesto (conversión total o parcial por línea).
create or replace function public.create_sales_order_from_quotation(p_quotation_id bigint, p_lines jsonb)
returns bigint
language plpgsql
security invoker
as $$
declare
  q record;
  l record;
  item jsonb;
  o_id bigint;
  new_line_id bigint;
  v_code varchar;
  v_qty numeric;
  v_remaining numeric;
  v_ratio numeric;
  v_line_no integer := 0;
  v_net numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
begin
  select * into q from public.quotation where id = p_quotation_id;
  if not found then
    raise exception 'Presupuesto no encontrado';
  end if;
  if q.status <> 'ACCEPTED' then
    raise exception 'Solo se puede crear un pedido desde un presupuesto aceptado';
  end if;
  if q.customer_id is null then
    raise exception 'El presupuesto debe tener cliente antes de crear el pedido';
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'Selecciona al menos una línea para crear el pedido';
  end if;

  v_code := public.generate_sales_order_code(q.company_id);

  insert into public.sales_order (
    company_id, quotation_id, customer_id, code, issue_date, requested_delivery_date, status,
    reference, notes, net_amount, discount_amount, tax_amount, total_amount,
    billing_address_street, billing_address_city, billing_address_postal_code, billing_address_region,
    installation_address_street, installation_address_city, installation_address_postal_code, installation_address_region,
    contact_id, contact_name, contact_email, contact_phone,
    commercial_id, warehouse_id, payment_method_id, payment_term_id, measurement_id, created_by
  ) values (
    q.company_id, q.id, q.customer_id, v_code, current_date, null, 'PENDING_MANUFACTURING',
    q.reference, q.notes, 0, 0, 0, 0,
    q.billing_address_street, q.billing_address_city, q.billing_address_postal_code, q.billing_address_region,
    q.installation_address_street, q.installation_address_city, q.installation_address_postal_code, q.installation_address_region,
    q.contact_id, q.contact_name, q.contact_email, q.contact_phone,
    q.commercial_id, q.warehouse_id, q.payment_method_id, q.payment_term_id, q.measurement_id, auth.uid()
  ) returning id into o_id;

  insert into public.sales_order_comment (sales_order_id, sales_order_line_id, text, is_public)
    select o_id, null, text, false
    from public.quotation_comment
    where quotation_id = p_quotation_id and quotation_line_id is null and is_public = false;

  for item in select * from jsonb_array_elements(p_lines)
  loop
    select * into l from public.quotation_line
      where id = (item->>'quotation_line_id')::bigint and quotation_id = p_quotation_id;
    if not found then
      raise exception 'Línea de presupuesto no válida';
    end if;

    v_qty := (item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Cantidad no válida para la línea %', l.line_no;
    end if;

    select l.quantity - coalesce(sum(sol.quantity) filter (where so.status <> 'CANCELLED'), 0)
      into v_remaining
      from public.sales_order_line sol
      join public.sales_order so on so.id = sol.sales_order_id
      where sol.quotation_line_id = l.id;
    v_remaining := coalesce(v_remaining, l.quantity);

    if v_qty > v_remaining then
      raise exception 'La cantidad solicitada para la línea % supera lo disponible (% de %)', l.line_no, v_remaining, l.quantity;
    end if;

    v_ratio := v_qty / l.quantity;
    v_line_no := v_line_no + 1;

    insert into public.sales_order_line (
      sales_order_id, quotation_line_id, line_no, product_id, description, quantity,
      unit_price, discount_percent, tax_percent, net_amount, tax_amount, total_amount, specific_data
    ) values (
      o_id, l.id, v_line_no, l.product_id, l.description, v_qty,
      l.unit_price, l.discount_percent, l.tax_percent,
      round(l.net_amount * v_ratio, 2), round(l.tax_amount * v_ratio, 2), round(l.total_amount * v_ratio, 2),
      coalesce(l.specific_data, '{}'::jsonb)
    ) returning id into new_line_id;

    insert into public.sales_order_comment (sales_order_id, sales_order_line_id, text, is_public)
      select o_id, new_line_id, text, false
      from public.quotation_comment
      where quotation_line_id = l.id and is_public = false;

    v_net := v_net + round(l.net_amount * v_ratio, 2);
    v_tax := v_tax + round(l.tax_amount * v_ratio, 2);
    v_total := v_total + round(l.total_amount * v_ratio, 2);
  end loop;

  update public.sales_order set net_amount = v_net, tax_amount = v_tax, total_amount = v_total
    where id = o_id;

  return o_id;
end;
$$;

grant execute on function public.create_sales_order_from_quotation(bigint, jsonb) to authenticated;

-- Corte de perfil (hoja de producción PROFILE_CUT).
create or replace function public.execute_manual_dimensional_cut_with_work_sheet(
  p_company_id bigint,
  p_sales_order_id bigint,
  p_sales_order_line_id bigint,
  p_sales_order_line_no integer,
  p_product_id bigint,
  p_product_code varchar,
  p_product_name text,
  p_characteristic_id bigint,
  p_characteristic_code varchar,
  p_characteristic_name text,
  p_required_dimension_values jsonb,
  p_quantity numeric,
  p_selections jsonb,
  p_reference text default null,
  p_notes text default null
)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_reservation_id bigint;
  v_work_sheet_id bigint;
  v_code varchar;
  v_item record;
  v_line_no integer := 1;
  v_total numeric := 0;
  v_started_at timestamptz := clock_timestamp();
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'La cantidad de la hoja de corte debe ser mayor que cero'; end if;
  if p_required_dimension_values is null or jsonb_typeof(p_required_dimension_values) <> 'array' or jsonb_array_length(p_required_dimension_values) <> 1 then raise exception 'La hoja de corte de perfil requiere una única dimensión de longitud'; end if;
  if (p_required_dimension_values->>0)::numeric <= 0 then raise exception 'La longitud de corte debe ser mayor que cero'; end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then raise exception 'La hoja de corte debe contener al menos una pieza seleccionada'; end if;

  v_reservation_id := public.execute_manual_dimensional_cut(p_company_id,p_product_id,p_characteristic_id,p_required_dimension_values,p_selections,p_reference,p_notes);
  v_code := public.generate_production_work_sheet_code(p_company_id);

  insert into public.production_work_sheet (company_id,code,document_type,issue_date,status,sales_order_id,sales_order_line_id,sales_order_line_no,product_id,product_code,product_name,characteristic_id,characteristic_code,characteristic_name,required_length,quantity,reference,notes,created_by)
  values (p_company_id,v_code,'PROFILE_CUT',now(),'ISSUED',p_sales_order_id,p_sales_order_line_id,p_sales_order_line_no,p_product_id,p_product_code,p_product_name,p_characteristic_id,p_characteristic_code,p_characteristic_name,(p_required_dimension_values->>0)::numeric,p_quantity,p_reference,p_notes,auth.uid())
  returning id into v_work_sheet_id;

  for v_item in
    select sri.id reservation_item_id,sri.stock_item_id,sri.allocated_quantity,sri.requested_dimension_values,sri.remaining_dimension_values,wsi.dimension_values source_dimension_values,ws.warehouse_id,w.code warehouse_code,w.name warehouse_name
    from public.stock_reservation_item sri
    join public.warehouse_stock_item wsi on wsi.id=sri.stock_item_id
    join public.warehouse_stock ws on ws.id=wsi.warehouse_stock_id
    join public.warehouse w on w.id=ws.warehouse_id
    where sri.reservation_id=v_reservation_id
    order by sri.id
  loop
    v_total:=v_total+v_item.allocated_quantity;
    insert into public.production_work_sheet_line (work_sheet_id,line_no,warehouse_id,warehouse_code,warehouse_name,stock_item_id,source_dimension_values,cut_dimension_values,quantity,remainder_dimension_values,selected_snapshot)
    values (v_work_sheet_id,v_line_no,v_item.warehouse_id,v_item.warehouse_code,v_item.warehouse_name,v_item.stock_item_id,v_item.source_dimension_values,v_item.requested_dimension_values,v_item.allocated_quantity,v_item.remaining_dimension_values,jsonb_build_object('reservation_id',v_reservation_id,'reservation_item_id',v_item.reservation_item_id,'stock_item_id',v_item.stock_item_id,'warehouse_id',v_item.warehouse_id,'warehouse_code',v_item.warehouse_code,'warehouse_name',v_item.warehouse_name,'source_dimension_values',v_item.source_dimension_values,'cut_dimension_values',v_item.requested_dimension_values,'quantity',v_item.allocated_quantity,'remainder_dimension_values',v_item.remaining_dimension_values));

    update public.warehouse_stock_item
    set remnant_generated_at=coalesce(remnant_generated_at,created_at),
        source_sales_order_id=p_sales_order_id,
        source_sales_order_line_id=p_sales_order_line_id,
        source_work_sheet_id=v_work_sheet_id,
        source_work_sheet_line_id=(select id from public.production_work_sheet_line where work_sheet_id=v_work_sheet_id and line_no=v_line_no),
        updated_at=now()
    where parent_stock_item_id=v_item.stock_item_id;

    if jsonb_typeof(v_item.remaining_dimension_values) = 'array' and jsonb_array_length(v_item.remaining_dimension_values) > 0 then
      update public.stock_movement sm
         set dimension_values = v_item.remaining_dimension_values
        from public.warehouse_stock_item remnant
       where remnant.parent_stock_item_id = v_item.stock_item_id
         and remnant.source_stock_movement_id = sm.id
         and (sm.dimension_values is null or jsonb_typeof(sm.dimension_values) <> 'array' or jsonb_array_length(sm.dimension_values) = 0);
    end if;

    if jsonb_typeof(v_item.requested_dimension_values) = 'array' and jsonb_array_length(v_item.requested_dimension_values) > 0 then
      update public.stock_movement
         set dimension_values = v_item.requested_dimension_values
       where id = (
         select sm2.id
           from public.stock_movement sm2
           join public.stock_movement_type smt on smt.id = sm2.movement_type_id
          where smt.code = 'DIMENSIONAL_CONSUMPTION'
            and smt.company_id = p_company_id
            and sm2.product_id = p_product_id
            and sm2.characteristic_id is not distinct from p_characteristic_id
            and sm2.warehouse_id = v_item.warehouse_id
            and sm2.quantity = v_item.allocated_quantity
            and sm2.movement_date >= v_started_at
            and (sm2.dimension_values is null or jsonb_typeof(sm2.dimension_values) <> 'array' or jsonb_array_length(sm2.dimension_values) = 0)
          order by sm2.id asc
          limit 1
       );
    end if;

    v_line_no:=v_line_no+1;
  end loop;
  if v_total<>p_quantity then raise exception 'La hoja de corte no coincide con la cantidad ejecutada: % de %',v_total,p_quantity; end if;
  return v_work_sheet_id;
end;
$$;

grant execute on function public.execute_manual_dimensional_cut_with_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,numeric,jsonb,text,text) to authenticated;

-- Confección de lona (hoja de producción LONA_CONFECTION) — se crea aquí; se
-- ejecuta después con execute_lona_confection_work_sheet(), que no inserta
-- la cabecera y por tanto no necesita tocarse para esto.
create or replace function public.create_lona_confection_work_sheet(
  p_company_id bigint,
  p_sales_order_id bigint,
  p_sales_order_line_id bigint,
  p_sales_order_line_no integer,
  p_product_id bigint,
  p_product_code varchar,
  p_product_name text,
  p_characteristic_id bigint,
  p_characteristic_code varchar,
  p_characteristic_name text,
  p_required_dimension_values jsonb,
  p_quantity numeric,
  p_unit_symbol varchar default null,
  p_unit_code varchar default null,
  p_reference text default null,
  p_notes text default null,
  p_selection_mode varchar default 'AUTOMATIC',
  p_selection_reason text default null,
  p_selections jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_work_sheet_id bigint;
  v_existing_id bigint;
  v_code varchar;
  v_selection jsonb;
  v_line_no integer := 1;
  v_total numeric := 0;
  v_qty numeric;
  v_source_dims jsonb;
  v_cut_dims jsonb;
  v_remainder_dims jsonb;
  v_warehouse_id bigint;
  v_stock_item_id bigint;
  v_warehouse_code varchar;
  v_warehouse_name text;
begin
  if p_company_id is null or p_sales_order_line_id is null or p_product_id is null then
    raise exception 'La hoja de confección necesita empresa, línea de pedido y artículo';
  end if;

  select id into v_existing_id
    from public.production_work_sheet
   where sales_order_line_id = p_sales_order_line_id
     and document_type = 'LONA_CONFECTION'
   order by id desc
   limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad de confección debe ser mayor que cero';
  end if;
  if p_required_dimension_values is null or jsonb_typeof(p_required_dimension_values) <> 'array' or jsonb_array_length(p_required_dimension_values) < 2 then
    raise exception 'La confección de lona requiere al menos dos dimensiones de corte';
  end if;
  if p_selections is null or jsonb_typeof(p_selections) <> 'array' or jsonb_array_length(p_selections) = 0 then
    raise exception 'La hoja de confección debe contener al menos un material seleccionado';
  end if;

  v_code := public.generate_production_work_sheet_code(p_company_id);

  insert into public.production_work_sheet (
    company_id, code, document_type, issue_date, status,
    sales_order_id, sales_order_line_id, sales_order_line_no,
    product_id, product_code, product_name,
    characteristic_id, characteristic_code, characteristic_name,
    required_length, required_dimension_values, quantity,
    unit_symbol, unit_code, reference, notes,
    selection_mode, selection_reason, created_by
  ) values (
    p_company_id, v_code, 'LONA_CONFECTION', now(), 'ISSUED',
    p_sales_order_id, p_sales_order_line_id, p_sales_order_line_no,
    p_product_id, p_product_code, p_product_name,
    p_characteristic_id, p_characteristic_code, p_characteristic_name,
    null, p_required_dimension_values, p_quantity,
    p_unit_symbol, p_unit_code, p_reference, p_notes,
    p_selection_mode, p_selection_reason, auth.uid()
  ) returning id into v_work_sheet_id;

  for v_selection in select value from jsonb_array_elements(p_selections)
  loop
    v_warehouse_id := nullif(v_selection->>'warehouse_id','')::bigint;
    v_stock_item_id := nullif(v_selection->>'stock_item_id','')::bigint;
    v_qty := coalesce((v_selection->>'quantity')::numeric, 0);
    v_source_dims := coalesce(v_selection->'source_dimension_values', '[]'::jsonb);
    v_cut_dims := coalesce(v_selection->'cut_dimension_values', p_required_dimension_values);
    v_remainder_dims := coalesce(v_selection->'remainder_dimension_values', '[]'::jsonb);

    if v_warehouse_id is null or v_qty <= 0 then
      raise exception 'Material seleccionado inválido en la hoja de confección';
    end if;
    if jsonb_typeof(v_source_dims) <> 'array' or jsonb_typeof(v_cut_dims) <> 'array' then
      raise exception 'Las dimensiones del material deben ser arrays JSON';
    end if;

    select code, name into v_warehouse_code, v_warehouse_name
      from public.warehouse where id = v_warehouse_id;

    insert into public.production_work_sheet_line (
      work_sheet_id, line_no, warehouse_id, warehouse_code, warehouse_name,
      stock_item_id, source_dimension_values, cut_dimension_values,
      quantity, remainder_dimension_values, selected_snapshot
    ) values (
      v_work_sheet_id, v_line_no, v_warehouse_id, v_warehouse_code, v_warehouse_name,
      v_stock_item_id, v_source_dims, v_cut_dims,
      v_qty, v_remainder_dims,
      v_selection || jsonb_build_object('warehouse_code', v_warehouse_code, 'warehouse_name', v_warehouse_name)
    );

    v_total := v_total + v_qty;
    v_line_no := v_line_no + 1;
  end loop;

  if v_total <> p_quantity then
    delete from public.production_work_sheet where id = v_work_sheet_id;
    raise exception 'La hoja de confección contiene % unidades de material para una necesidad de %', v_total, p_quantity;
  end if;

  return v_work_sheet_id;
exception
  when unique_violation then
    select id into v_existing_id
      from public.production_work_sheet
     where sales_order_line_id = p_sales_order_line_id
       and document_type = 'LONA_CONFECTION'
     order by id desc
     limit 1;
    if v_existing_id is not null then return v_existing_id; end if;
    raise;
end;
$$;

grant execute on function public.create_lona_confection_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,numeric,varchar,varchar,text,text,varchar,text,jsonb) to authenticated;

-- Consumo de componentes (hoja de producción COMPONENT_CONSUMPTION) — se crea
-- y ejecuta en la misma transacción.
create or replace function public.create_and_execute_component_consumption_work_sheet(
  p_company_id bigint,
  p_sales_order_id bigint,
  p_sales_order_line_id bigint,
  p_sales_order_line_no integer,
  p_product_id bigint,
  p_product_code varchar,
  p_product_name text,
  p_quantity numeric,
  p_lines jsonb,
  p_reference text default null,
  p_notes text default null
)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_work_sheet_id bigint;
  v_existing_id bigint;
  v_code varchar;
  v_line jsonb;
  v_line_no integer := 1;
  v_warehouse_id bigint;
  v_component_product_id bigint;
  v_component_product_code varchar;
  v_component_product_name text;
  v_component_unit_code varchar;
  v_qty numeric;
  v_warehouse_code varchar;
  v_warehouse_name text;
  v_movement_id bigint;
  v_component_product public.product%rowtype;
begin
  if p_company_id is null or p_sales_order_line_id is null then
    raise exception 'La hoja de componentes necesita empresa y línea de pedido';
  end if;

  select id into v_existing_id
    from public.production_work_sheet
   where sales_order_line_id = p_sales_order_line_id
     and document_type = 'COMPONENT_CONSUMPTION'
   order by id desc
   limit 1;
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La cantidad de la línea debe ser mayor que cero';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'La hoja de componentes debe contener al menos un componente';
  end if;

  v_code := public.generate_production_work_sheet_code(p_company_id);

  insert into public.production_work_sheet (
    company_id, code, document_type, issue_date, status,
    sales_order_id, sales_order_line_id, sales_order_line_no,
    product_id, product_code, product_name,
    required_length, quantity, reference, notes, created_by
  ) values (
    p_company_id, v_code, 'COMPONENT_CONSUMPTION', now(), 'ISSUED',
    p_sales_order_id, p_sales_order_line_id, p_sales_order_line_no,
    p_product_id, p_product_code, p_product_name,
    null, p_quantity, p_reference, p_notes, auth.uid()
  ) returning id into v_work_sheet_id;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_warehouse_id := nullif(v_line->>'warehouse_id','')::bigint;
    v_component_product_id := nullif(v_line->>'product_id','')::bigint;
    v_component_product_code := v_line->>'product_code';
    v_component_product_name := v_line->>'product_name';
    v_component_unit_code := v_line->>'unit_code';
    v_qty := coalesce((v_line->>'quantity')::numeric, 0);

    if v_warehouse_id is null or v_component_product_id is null or v_qty <= 0 then
      raise exception 'Componente inválido en la hoja de consumo';
    end if;

    select * into v_component_product from public.product where id = v_component_product_id and company_id = p_company_id and deleted_at is null;
    if not found then
      raise exception 'El componente % no existe para la empresa indicada', v_component_product_id;
    end if;
    if coalesce(v_component_product.include_measurements_in_stock, false) then
      raise exception 'El componente % es un artículo dimensional; no puede consumirse como unidad simple', coalesce(v_component_product_code, v_component_product.code);
    end if;

    select code, name into v_warehouse_code, v_warehouse_name
      from public.warehouse where id = v_warehouse_id;

    insert into public.production_work_sheet_line (
      work_sheet_id, line_no, warehouse_id, warehouse_code, warehouse_name,
      quantity, component_product_id, component_product_code, component_product_name,
      component_unit_code, selected_snapshot
    ) values (
      v_work_sheet_id, v_line_no, v_warehouse_id, v_warehouse_code, v_warehouse_name,
      v_qty, v_component_product_id, v_component_product_code, v_component_product_name,
      v_component_unit_code,
      jsonb_build_object(
        'warehouse_id', v_warehouse_id, 'warehouse_code', v_warehouse_code, 'warehouse_name', v_warehouse_name,
        'product_id', v_component_product_id, 'product_code', v_component_product_code,
        'product_name', v_component_product_name, 'unit_code', v_component_unit_code, 'quantity', v_qty
      )
    );

    v_movement_id := public.register_stock_movement(
      p_company_id, v_warehouse_id, v_component_product_id, v_qty, 'COMPONENT_CONSUMPTION',
      null, p_reference, coalesce(p_notes, 'Consumo de componente · ' || v_code), now(), null, null
    );

    v_line_no := v_line_no + 1;
  end loop;

  update public.production_work_sheet set status = 'COMPLETED', updated_at = now() where id = v_work_sheet_id;

  return v_work_sheet_id;
exception
  when unique_violation then
    select id into v_existing_id
      from public.production_work_sheet
     where sales_order_line_id = p_sales_order_line_id
       and document_type = 'COMPONENT_CONSUMPTION'
     order by id desc
     limit 1;
    if v_existing_id is not null then return v_existing_id; end if;
    raise;
end;
$$;

grant execute on function public.create_and_execute_component_consumption_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,numeric,jsonb,text,text) to authenticated;

-- Albarán (delivery_note).
create or replace function public.create_delivery_note_for_lines(
  p_sales_order_id bigint,
  p_installation_id bigint,
  p_lines jsonb,
  p_delivery_date date default null,
  p_carrier text default null,
  p_tracking_number text default null,
  p_notes text default null
) returns bigint
language plpgsql
security invoker
as $$
declare
  o record;
  v_id bigint;
  v_code varchar;
  v_line jsonb;
  v_sol record;
  v_remaining numeric;
  v_qty numeric;
  v_net numeric := 0;
  v_total numeric := 0;
  v_line_net numeric;
  v_line_total numeric;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'No hay líneas que entregar';
  end if;

  select * into o from public.sales_order where id = p_sales_order_id;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;

  v_code := public.generate_delivery_note_code(o.company_id);

  insert into public.delivery_note (
    company_id, code, sales_order_id, installation_id, customer_id, delivery_date, carrier, tracking_number,
    delivery_address_street, delivery_address_city, delivery_address_postal_code, delivery_address_region,
    status, notes, net_amount, tax_amount, total_amount, created_by
  ) values (
    o.company_id, v_code, o.id, p_installation_id, o.customer_id, p_delivery_date, p_carrier, p_tracking_number,
    coalesce(o.installation_address_street, o.billing_address_street),
    coalesce(o.installation_address_city, o.billing_address_city),
    coalesce(o.installation_address_postal_code, o.billing_address_postal_code),
    coalesce(o.installation_address_region, o.billing_address_region),
    'PREPARED', p_notes, 0, 0, 0, auth.uid()
  ) returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    select * into v_sol from public.sales_order_line
      where id = (v_line->>'sales_order_line_id')::bigint and sales_order_id = p_sales_order_id;
    if not found then
      raise exception 'La línea % no pertenece a este pedido', v_line->>'sales_order_line_id';
    end if;

    v_qty := (v_line->>'quantity')::numeric;
    if v_qty <= 0 then
      raise exception 'La cantidad a entregar debe ser mayor que 0';
    end if;

    select v_sol.quantity - coalesce(sum(dnl.quantity), 0) into v_remaining
      from public.delivery_note_line dnl
      join public.delivery_note dn on dn.id = dnl.delivery_note_id and dn.deleted_at is null
     where dnl.sales_order_line_id = v_sol.id;
    v_remaining := coalesce(v_remaining, v_sol.quantity);
    if v_qty > v_remaining then
      raise exception 'La línea % solo tiene % unidades pendientes de entregar', v_sol.line_no, v_remaining;
    end if;

    v_line_net := round(v_sol.net_amount * v_qty / nullif(v_sol.quantity, 0), 2);
    v_line_total := round(v_sol.total_amount * v_qty / nullif(v_sol.quantity, 0), 2);

    insert into public.delivery_note_line (
      delivery_note_id, sales_order_line_id, line_no, product_id, description, quantity, unit_price,
      discount_percent, net_amount, total_amount, specific_data
    ) values (
      v_id, v_sol.id, v_sol.line_no, v_sol.product_id, v_sol.description, v_qty, v_sol.unit_price,
      v_sol.discount_percent, coalesce(v_line_net, 0), coalesce(v_line_total, 0), coalesce(v_sol.specific_data, '{}'::jsonb)
    );

    v_net := v_net + coalesce(v_line_net, 0);
    v_total := v_total + coalesce(v_line_total, 0);
  end loop;

  update public.delivery_note set net_amount = v_net, tax_amount = v_total - v_net, total_amount = v_total where id = v_id;

  return v_id;
end;
$$;
grant execute on function public.create_delivery_note_for_lines(bigint, bigint, jsonb, date, text, text, text) to authenticated;

-- Factura.
create or replace function public.create_invoice_from_sales_order(p_sales_order_id bigint) returns bigint
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  o record;
  co record;
  cust_tax_id text;
  l record;
  pt record;
  i_id bigint;
  v_code varchar;
  v_line_no integer := 0;
  v_installment_count integer := 0;
  v_amount numeric;
  v_last_installment_id bigint;
  v_sum numeric;
  v_prev_hash text;
  v_chain_seq bigint;
  v_hash text;
  v_issuer_address text;
begin
  select * into o from public.sales_order where id = p_sales_order_id;
  if not found then
    raise exception 'Pedido no encontrado';
  end if;
  if o.status not in ('MANUFACTURED', 'INSTALLATION_SCHEDULED', 'INSTALLED', 'INVOICED') then
    raise exception 'El pedido debe estar fabricado antes de generar la factura';
  end if;

  if exists(select 1 from public.invoice where sales_order_id = p_sales_order_id and status = 'ISSUED' and invoice_type = 'ORIGINAL') then
    select id into i_id from public.invoice where sales_order_id = p_sales_order_id and status = 'ISSUED' and invoice_type = 'ORIGINAL' order by id desc limit 1;
    return i_id;
  end if;

  select * into co from public.company where id = o.company_id;
  select p.tax_id into cust_tax_id from public.customer c join public.party p on p.id = c.party_id where c.id = o.customer_id;

  v_issuer_address := nullif(trim(concat_ws(', ', co.street, co.postal_code, co.city, co.region)), '');
  v_code := public.generate_invoice_code(o.company_id);

  select record_hash, chain_sequence into v_prev_hash, v_chain_seq from public.invoice where company_id = o.company_id order by chain_sequence desc nulls last limit 1;
  v_chain_seq := coalesce(v_chain_seq, 0) + 1;
  v_hash := encode(digest(concat_ws('|', o.company_id::text, v_code, current_date::text, o.total_amount::text, coalesce(v_prev_hash, 'GENESIS')), 'sha256'), 'hex');

  insert into public.invoice (
    company_id, sales_order_id, customer_id, code, issue_date, status, reference, notes,
    payment_method_id, payment_term_id,
    billing_address_street, billing_address_city, billing_address_postal_code, billing_address_region,
    net_amount, discount_amount, tax_amount, total_amount,
    series, invoice_type, issuer_tax_id, issuer_legal_name, issuer_address, customer_tax_id,
    chain_sequence, previous_hash, record_hash, created_by
  ) values (
    o.company_id, o.id, o.customer_id, v_code, current_date, 'ISSUED', o.reference, o.notes,
    o.payment_method_id, o.payment_term_id,
    o.billing_address_street, o.billing_address_city, o.billing_address_postal_code, o.billing_address_region,
    o.net_amount, o.discount_amount, o.tax_amount, o.total_amount,
    'FRA', 'ORIGINAL', co.tax_id, co.name, v_issuer_address, cust_tax_id,
    v_chain_seq, v_prev_hash, v_hash, auth.uid()
  ) returning id into i_id;

  for l in select * from public.sales_order_line where sales_order_id = p_sales_order_id order by line_no loop
    v_line_no := v_line_no + 1;
    insert into public.invoice_line (
      invoice_id, sales_order_line_id, line_no, product_id, description, quantity, unit_price,
      discount_percent, tax_percent, net_amount, tax_amount, total_amount
    ) values (
      i_id, l.id, v_line_no, l.product_id, l.description, l.quantity, l.unit_price,
      l.discount_percent, l.tax_percent, l.net_amount, l.tax_amount, l.total_amount
    );
  end loop;

  insert into public.invoice_tax_breakdown (invoice_id, tax_percent, base_amount, tax_amount)
    select i_id, tax_percent, sum(net_amount), sum(tax_amount)
    from public.sales_order_line where sales_order_id = p_sales_order_id
    group by tax_percent;

  if o.payment_term_id is not null then
    select count(*) into v_installment_count from public.payment_term_installment where payment_term_id = o.payment_term_id;
  end if;

  if v_installment_count > 0 then
    for pt in select * from public.payment_term_installment where payment_term_id = o.payment_term_id order by sequence loop
      v_amount := round(o.total_amount * pt.percentage / 100, 2);
      insert into public.invoice_installment (invoice_id, sequence, percentage, due_date, amount)
      values (i_id, pt.sequence, pt.percentage, current_date + pt.days_offset, v_amount)
      returning id into v_last_installment_id;
    end loop;
    select coalesce(sum(amount), 0) into v_sum from public.invoice_installment where invoice_id = i_id;
    update public.invoice_installment set amount = amount + (o.total_amount - v_sum) where id = v_last_installment_id;
  else
    insert into public.invoice_installment (invoice_id, sequence, percentage, due_date, amount)
    values (i_id, 1, 100, current_date, o.total_amount);
  end if;

  update public.sales_order set status = 'INVOICED', updated_at = now() where id = o.id;

  return i_id;
end;
$$;

-- Montaje: registra quién lo completó (puede ser distinto de quién lo programó).
create or replace function public.complete_installation(
  p_installation_id bigint,
  p_end_time varchar,
  p_actual_duration varchar
)
returns bigint
language plpgsql
security invoker
as $$
declare
  v_order_id bigint;
  v_lines jsonb;
  v_delivery_note_id bigint;
  v_all_delivered boolean;
begin
  if p_end_time is null or trim(p_end_time) = '' or trim(p_end_time) = '00:00' then
    raise exception 'Debe indicar la hora de finalización';
  end if;
  if p_actual_duration is null or trim(p_actual_duration) = '' or trim(p_actual_duration) = '0' then
    raise exception 'Debe indicar la duración real';
  end if;

  update public.installation
     set status = 'COMPLETED', end_time = p_end_time, actual_duration = p_actual_duration,
         completed_by = auth.uid(), updated_at = now()
   where id = p_installation_id and status in ('SCHEDULED', 'IN_PROGRESS', 'BLOCKED')
   returning sales_order_id into v_order_id;

  if v_order_id is null then
    raise exception 'La instalación no existe o ya está cerrada';
  end if;

  select jsonb_agg(jsonb_build_object('sales_order_line_id', il.sales_order_line_id, 'quantity', sol.quantity))
    into v_lines
    from public.installation_line il
    join public.sales_order_line sol on sol.id = il.sales_order_line_id
   where il.installation_id = p_installation_id;

  if v_lines is not null and jsonb_array_length(v_lines) > 0 then
    v_delivery_note_id := public.create_delivery_note_for_lines(
      v_order_id, p_installation_id, v_lines, current_date, null, null, 'Generado al completar el montaje'
    );
  end if;

  select not exists(
    select 1 from public.sales_order_delivery_status(v_order_id) s where s.remaining_quantity > 0
  ) into v_all_delivered;

  update public.sales_order
     set status = case when v_all_delivered then 'INSTALLED' else 'INSTALLATION_SCHEDULED' end,
         updated_at = now()
   where id = v_order_id and status not in ('CANCELLED', 'INVOICED');

  return v_delivery_note_id;
end;
$$;
