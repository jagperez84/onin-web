alter table public.warehouse_stock_item add column if not exists dimension_units jsonb not null default '[]'::jsonb;
alter table public.warehouse_stock_item drop constraint if exists warehouse_stock_item_dimension_units_array_check;
alter table public.warehouse_stock_item add constraint warehouse_stock_item_dimension_units_array_check check (jsonb_typeof(dimension_units)='array');
alter table public.stock_movement add column if not exists dimension_units jsonb not null default '[]'::jsonb;
alter table public.stock_reservation add column if not exists dimension_units jsonb not null default '[]'::jsonb;
alter table public.stock_reservation_item add column if not exists requested_dimension_units jsonb not null default '[]'::jsonb;
alter table public.stock_reservation_item add column if not exists remaining_dimension_units jsonb not null default '[]'::jsonb;
alter table public.production_work_sheet add column if not exists required_dimension_units jsonb not null default '[]'::jsonb;
alter table public.production_work_sheet_line add column if not exists source_dimension_units jsonb not null default '[]'::jsonb;
alter table public.production_work_sheet_line add column if not exists cut_dimension_units jsonb not null default '[]'::jsonb;
alter table public.production_work_sheet_line add column if not exists remainder_dimension_units jsonb not null default '[]'::jsonb;

update public.warehouse_stock_item wsi
set dimension_units = coalesce((
  select jsonb_agg(coalesce(u.code,u.name) order by mtd.dimension_number)
  from public.product p
  left join public.product_family pf on pf.id=p.family_id
  join public.measurement_type_dimension mtd on mtd.measurement_type_id=coalesce(p.measurement_type_id,pf.measurement_type_id)
  left join public.unit u on u.id=mtd.unit_id
  where p.id=wsi.product_id
), '[]'::jsonb)
where jsonb_array_length(wsi.dimension_values) > 0;

update public.warehouse_stock ws
set characteristic_id=null, quantity=5, reserved_quantity=0, updated_at=now()
from public.warehouse w, public.product p
where ws.warehouse_id=w.id and ws.product_id=p.id and w.code='WH-MAL' and p.code='TEST-DIM-001';

delete from public.warehouse_stock_item
where product_id=(select id from public.product where code='TEST-DIM-001')
  and warehouse_stock_id=(select ws.id from public.warehouse_stock ws join public.warehouse w on w.id=ws.warehouse_id where ws.product_id=(select id from public.product where code='TEST-DIM-001') and w.code='WH-MAL' limit 1)
  and not exists (select 1 from public.stock_reservation_item sri where sri.stock_item_id=warehouse_stock_item.id)
  and not exists (select 1 from public.production_work_sheet_line pws where pws.stock_item_id=warehouse_stock_item.id);

insert into public.warehouse_stock_item
  (warehouse_stock_id,product_id,characteristic_id,quantity,dimension_values,dimension_units,status)
select ws.id,p.id,null,1,'[300,200]'::jsonb,'["cm","cm"]'::jsonb,'AVAILABLE'
from public.warehouse_stock ws
join public.warehouse w on w.id=ws.warehouse_id
join public.product p on p.id=ws.product_id
cross join generate_series(1,5)
where w.code='WH-MAL' and p.code='TEST-DIM-001'
  and not exists (
    select 1 from public.warehouse_stock_item x
    where x.warehouse_stock_id=ws.id and x.product_id=p.id and x.characteristic_id is null
      and x.dimension_values='[300,200]'::jsonb and x.dimension_units='["cm","cm"]'::jsonb and x.status='AVAILABLE'
  );

drop function if exists public.create_lona_confection_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,numeric,varchar,varchar,text,text,varchar,text,jsonb);
create or replace function public.create_lona_confection_work_sheet(
  p_company_id bigint,p_sales_order_id bigint,p_sales_order_line_id bigint,p_sales_order_line_no integer,
  p_product_id bigint,p_product_code varchar,p_product_name text,p_characteristic_id bigint,
  p_characteristic_code varchar,p_characteristic_name text,p_required_dimension_values jsonb,
  p_required_dimension_units jsonb,p_quantity numeric,p_unit_symbol varchar default null,p_unit_code varchar default null,
  p_reference text default null,p_notes text default null,p_selection_mode varchar default 'AUTOMATIC',
  p_selection_reason text default null,p_selections jsonb default '[]'::jsonb
) returns bigint language plpgsql security invoker as $$
declare
  v_work_sheet_id bigint; v_code varchar; v_selection jsonb; v_line_no integer:=1; v_total numeric:=0;
  v_qty numeric; v_source_dims jsonb; v_source_units jsonb; v_cut_dims jsonb; v_cut_units jsonb;
  v_remainder_dims jsonb; v_remainder_units jsonb; v_warehouse_id bigint; v_stock_item_id bigint;
  v_warehouse_code varchar; v_warehouse_name text;
begin
  if p_company_id is null or p_sales_order_line_id is null or p_product_id is null then raise exception 'La hoja de confección necesita empresa, línea de pedido y artículo'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'La cantidad de confección debe ser mayor que cero'; end if;
  if p_required_dimension_values is null or jsonb_typeof(p_required_dimension_values)<>'array' or jsonb_array_length(p_required_dimension_values)<2 then raise exception 'La confección de lona requiere al menos dos dimensiones de corte'; end if;
  if p_required_dimension_units is null or jsonb_typeof(p_required_dimension_units)<>'array' or jsonb_array_length(p_required_dimension_units)<>jsonb_array_length(p_required_dimension_values) then raise exception 'Las unidades de las dimensiones requeridas no son válidas'; end if;
  if p_selections is null or jsonb_typeof(p_selections)<>'array' or jsonb_array_length(p_selections)=0 then raise exception 'La hoja de confección debe contener al menos un material seleccionado'; end if;
  v_code:=public.generate_production_work_sheet_code(p_company_id);
  insert into public.production_work_sheet(company_id,code,document_type,issue_date,status,sales_order_id,sales_order_line_id,sales_order_line_no,product_id,product_code,product_name,characteristic_id,characteristic_code,characteristic_name,required_length,required_dimension_values,required_dimension_units,quantity,unit_symbol,unit_code,reference,notes,selection_mode,selection_reason)
  values(p_company_id,v_code,'LONA_CONFECTION',now(),'ISSUED',p_sales_order_id,p_sales_order_line_id,p_sales_order_line_no,p_product_id,p_product_code,p_product_name,p_characteristic_id,p_characteristic_code,p_characteristic_name,null,p_required_dimension_values,p_required_dimension_units,p_quantity,p_unit_symbol,p_unit_code,p_reference,p_notes,p_selection_mode,p_selection_reason)
  returning id into v_work_sheet_id;
  for v_selection in select value from jsonb_array_elements(p_selections) loop
    v_warehouse_id:=nullif(v_selection->>'warehouse_id','')::bigint; v_stock_item_id:=nullif(v_selection->>'stock_item_id','')::bigint;
    v_qty:=coalesce((v_selection->>'quantity')::numeric,0); v_source_dims:=coalesce(v_selection->'source_dimension_values','[]'::jsonb); v_source_units:=coalesce(v_selection->'source_dimension_units','[]'::jsonb);
    v_cut_dims:=coalesce(v_selection->'cut_dimension_values',p_required_dimension_values); v_cut_units:=coalesce(v_selection->'cut_dimension_units',p_required_dimension_units);
    v_remainder_dims:=coalesce(v_selection->'remainder_dimension_values','[]'::jsonb); v_remainder_units:=coalesce(v_selection->'remainder_dimension_units','[]'::jsonb);
    if v_warehouse_id is null or v_qty<=0 then raise exception 'Material seleccionado inválido en la hoja de confección'; end if;
    if jsonb_typeof(v_source_dims)<>'array' or jsonb_typeof(v_source_units)<>'array' or jsonb_array_length(v_source_dims)<>jsonb_array_length(v_source_units) then raise exception 'Las dimensiones y unidades del material no son válidas'; end if;
    select code,name into v_warehouse_code,v_warehouse_name from public.warehouse where id=v_warehouse_id;
    insert into public.production_work_sheet_line(work_sheet_id,line_no,warehouse_id,warehouse_code,warehouse_name,stock_item_id,source_dimension_values,source_dimension_units,cut_dimension_values,cut_dimension_units,quantity,remainder_dimension_values,remainder_dimension_units,selected_snapshot)
    values(v_work_sheet_id,v_line_no,v_warehouse_id,v_warehouse_code,v_warehouse_name,v_stock_item_id,v_source_dims,v_source_units,v_cut_dims,v_cut_units,v_qty,v_remainder_dims,v_remainder_units,v_selection||jsonb_build_object('warehouse_code',v_warehouse_code,'warehouse_name',v_warehouse_name));
    v_total:=v_total+v_qty; v_line_no:=v_line_no+1;
  end loop;
  if v_total<>p_quantity then delete from public.production_work_sheet where id=v_work_sheet_id; raise exception 'La hoja de confección contiene % unidades de material para una necesidad de %',v_total,p_quantity; end if;
  return v_work_sheet_id;
end; $$;
grant execute on function public.create_lona_confection_work_sheet(bigint,bigint,bigint,integer,bigint,varchar,text,bigint,varchar,text,jsonb,jsonb,numeric,varchar,varchar,text,text,varchar,text,jsonb) to authenticated;

comment on column public.warehouse_stock_item.dimension_units is 'Unidades de medida de las dimensiones físicas, en el mismo orden que dimension_values.';
comment on column public.stock_movement.dimension_units is 'Unidades de medida de dimension_values.';
comment on column public.production_work_sheet.required_dimension_units is 'Unidades de medida de required_dimension_values.';
