create or replace function public.execute_lona_confection_work_sheet(p_work_sheet_id bigint)
returns void language plpgsql security invoker as $$
declare
  v_sheet public.production_work_sheet%rowtype; v_line record; v_item public.warehouse_stock_item%rowtype; v_stock public.warehouse_stock%rowtype;
  v_product public.product%rowtype; v_family public.product_family%rowtype; v_type public.stock_movement_type%rowtype; v_movement_id bigint; v_new_item bigint;
  v_w numeric; v_h numeric; v_cw numeric; v_ch numeric; v_remnants jsonb; v_min numeric:=0; v_recuttable boolean:=false; v_rotated boolean;
  v_source_units jsonb; v_cut_units jsonb; v_remnant_units jsonb;
begin
  select * into v_sheet from public.production_work_sheet where id=p_work_sheet_id and document_type='LONA_CONFECTION' for update;
  if not found then raise exception 'Hoja de confección no encontrada'; end if;
  if v_sheet.status<>'ISSUED' then raise exception 'La hoja % no está pendiente de ejecución',v_sheet.code; end if;
  select * into v_product from public.product where id=v_sheet.product_id and company_id=v_sheet.company_id and deleted_at is null and active=true;
  if not found or not v_product.stock_enabled or not v_product.include_measurements_in_stock then raise exception 'El artículo no tiene stock dimensional activo'; end if;
  if v_product.family_id is not null then select * into v_family from public.product_family where id=v_product.family_id and deleted_at is null; if found then v_recuttable:=coalesce(v_family.recuttable,false); v_min:=coalesce(v_product.minimum_remainder,v_family.minimum_remainder,0); end if; end if;
  select * into v_type from public.stock_movement_type where company_id=v_sheet.company_id and code='DIMENSIONAL_CONSUMPTION' and active=true;
  if not found then raise exception 'No existe DIMENSIONAL_CONSUMPTION'; end if;
  for v_line in select * from public.production_work_sheet_line where work_sheet_id=p_work_sheet_id order by line_no loop
    if v_line.quantity<>1 or v_line.stock_item_id is null then raise exception 'La línea % no referencia una pieza física única de stock',v_line.line_no; end if;
    select * into v_item from public.warehouse_stock_item where id=v_line.stock_item_id for update;
    if not found or v_item.status<>'AVAILABLE' then raise exception 'La pieza de stock % ya no está disponible',v_line.stock_item_id; end if;
    if jsonb_array_length(v_item.dimension_values)<>2 or jsonb_array_length(v_line.cut_dimension_values)<>2 then raise exception 'La pieza % no tiene dos dimensiones válidas',v_line.stock_item_id; end if;
    v_w:=(v_item.dimension_values->>0)::numeric; v_h:=(v_item.dimension_values->>1)::numeric; v_cw:=(v_line.cut_dimension_values->>0)::numeric; v_ch:=(v_line.cut_dimension_values->>1)::numeric;
    if not ((v_w>=v_cw and v_h>=v_ch) or (v_w>=v_ch and v_h>=v_cw)) then raise exception 'La pieza % ya no permite el corte solicitado',v_line.stock_item_id; end if;
    v_rotated:=not(v_w>=v_cw and v_h>=v_ch); if v_rotated then v_cw:=(v_line.cut_dimension_values->>1)::numeric; v_ch:=(v_line.cut_dimension_values->>0)::numeric; end if;
    v_source_units:=coalesce(v_item.dimension_units,v_line.source_dimension_units,'[]'::jsonb); v_cut_units:=coalesce(v_line.cut_dimension_units,v_sheet.required_dimension_units,'[]'::jsonb);
    select * into v_stock from public.warehouse_stock where id=v_item.warehouse_stock_id for update;
    insert into public.stock_movement(company_id,warehouse_id,product_id,movement_type_id,characteristic_id,quantity,movement_date,reference,notes,dimension_values,dimension_units,warehouse_stock_item_id)
    values(v_sheet.company_id,v_stock.warehouse_id,v_item.product_id,v_type.id,v_item.characteristic_id,1,now(),v_sheet.reference,'Consumo de lona 2D · '||v_sheet.code,jsonb_build_array(v_cw,v_ch),v_cut_units,v_item.id) returning id into v_movement_id;
    update public.warehouse_stock_item set status='CONSUMED',source_stock_movement_id=v_movement_id,updated_at=now() where id=v_item.id;
    update public.warehouse_stock set quantity=greatest(0,quantity-1),reserved_quantity=greatest(0,reserved_quantity-1),updated_at=now() where id=v_item.warehouse_stock_id;
    v_remnants:='[]'::jsonb; if v_w-v_cw>0 and v_ch>0 then v_remnants:=v_remnants||jsonb_build_array(jsonb_build_array(v_w-v_cw,v_ch)); end if; if v_h-v_ch>0 and v_w>0 then v_remnants:=v_remnants||jsonb_build_array(jsonb_build_array(v_w,v_h-v_ch)); end if;
    v_remnant_units:=v_source_units;
    update public.production_work_sheet_line set remainder_pieces=v_remnants,selected_snapshot=selected_snapshot||jsonb_build_object('executed',true,'rotated',v_rotated,'remainder_pieces',v_remnants) where id=v_line.id;
    if v_recuttable then
      for v_cw,v_ch in select (x->>0)::numeric,(x->>1)::numeric from jsonb_array_elements(v_remnants) x loop
        if greatest(v_cw,v_ch)>=v_min and v_cw>0 and v_ch>0 then
          insert into public.warehouse_stock_item(warehouse_stock_id,product_id,characteristic_id,quantity,dimension_values,dimension_units,status,parent_stock_item_id,source_stock_movement_id,source_sales_order_id,source_sales_order_line_id,source_work_sheet_id,source_work_sheet_line_id,remnant_generated_at)
          values(v_item.warehouse_stock_id,v_item.product_id,v_item.characteristic_id,1,jsonb_build_array(v_cw,v_ch),v_remnant_units,'AVAILABLE',v_item.id,null,v_sheet.sales_order_id,v_sheet.sales_order_line_id,p_work_sheet_id,v_line.id,now()) returning id into v_new_item;
          select * into v_type from public.stock_movement_type where company_id=v_sheet.company_id and code='DIMENSIONAL_REMNANT' and active=true; if not found then raise exception 'No existe DIMENSIONAL_REMNANT'; end if;
          insert into public.stock_movement(company_id,warehouse_id,product_id,movement_type_id,characteristic_id,quantity,movement_date,reference,notes,dimension_values,dimension_units,warehouse_stock_item_id)
          values(v_sheet.company_id,v_stock.warehouse_id,v_item.product_id,v_type.id,v_item.characteristic_id,1,now(),v_sheet.reference,'Remanente de lona · '||v_sheet.code,jsonb_build_array(v_cw,v_ch),v_remnant_units,v_new_item) returning id into v_movement_id;
          update public.warehouse_stock_item set source_stock_movement_id=v_movement_id where id=v_new_item; update public.warehouse_stock set quantity=quantity+1,updated_at=now() where id=v_item.warehouse_stock_id;
        else
          select * into v_type from public.stock_movement_type where company_id=v_sheet.company_id and code='DIMENSIONAL_SCRAP' and active=true; if not found then raise exception 'No existe DIMENSIONAL_SCRAP'; end if;
          insert into public.stock_movement(company_id,warehouse_id,product_id,movement_type_id,characteristic_id,quantity,movement_date,reference,notes,dimension_values,dimension_units,warehouse_stock_item_id)
          values(v_sheet.company_id,v_stock.warehouse_id,v_item.product_id,v_type.id,v_item.characteristic_id,1,now(),v_sheet.reference,'Merma de lona · '||v_sheet.code,jsonb_build_array(v_cw,v_ch),v_remnant_units,v_item.id);
        end if;
      end loop;
    end if;
  end loop;
  update public.production_work_sheet set status='COMPLETED',updated_at=now() where id=p_work_sheet_id;
end; $$;
grant execute on function public.execute_lona_confection_work_sheet(bigint) to authenticated;
