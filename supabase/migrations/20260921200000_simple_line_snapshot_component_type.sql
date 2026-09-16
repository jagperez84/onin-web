-- Bug: en una línea de artículo simple, el "Corte perfil"/"Confección lona" del pedido se
-- decide en el cliente mirando isProfileComponent()/isFabricOrLonaComponent() sobre el
-- componente sintetizado por build_simple_line_configuration_snapshot — y esas funciones,
-- a falta de un component_type explícito, adivinan por el nombre/código del artículo
-- (contiene "perfil", tiene una sola dimensión de longitud...). Esa heurística está pensada
-- para el despiece de un OTD (donde no hay ninguna otra señal a mano) pero es frágil, y para
-- una línea simple SÍ tenemos la señal real: product_family.recuttable/confectionable — el
-- mismo interruptor que ya usa el resto del sistema (corte de perfil, confección de lona,
-- create_lona_confection_work_sheet…) para decidir si un artículo es cortable o confeccionable.
--
-- Se amplía build_simple_line_configuration_snapshot para resolver ese family_id y fijar
-- component_type: 'PROFILE' | 'LONA' | null, que las funciones de clasificación del cliente ya
-- comprueban en primer lugar (antes que cualquier heurística de nombre). Se vuelve a rellenar
-- hacia atrás sales_order_line y delivery_note_line ya generados a partir de una línea simple.

create or replace function public.build_simple_line_configuration_snapshot(
  p_quotation_line_id bigint,
  p_product_id bigint
) returns jsonb
language plpgsql
security invoker
stable
as $$
declare
  v_dimensions jsonb;
  v_char_attribute_id bigint;
  v_char_code text;
  v_char_name text;
  v_color_id bigint;
  v_color_code text;
  v_color_name text;
  v_color_hex text;
  v_product_code text;
  v_product_commercial text;
  v_product_technical text;
  v_family_id bigint;
  v_recuttable boolean := false;
  v_confectionable boolean := false;
  v_component_type text;
begin
  if p_quotation_line_id is null or p_product_id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'code', qld.code,
           'name', qld.name,
           'value', qld.value,
           'unit_id', qld.unit_id,
           'unit_code', u.code,
           'unit_symbol', coalesce(u.symbol, u.code)
         ) order by qld.sort_order), '[]'::jsonb)
    into v_dimensions
    from public.quotation_line_dimension qld
    left join public.unit u on u.id = qld.unit_id
   where qld.quotation_line_id = p_quotation_line_id;

  select qlc.attribute_id, pa.code, pa.name, qlc.color_id, col.code, col.name, col.hex
    into v_char_attribute_id, v_char_code, v_char_name, v_color_id, v_color_code, v_color_name, v_color_hex
    from public.quotation_line_characteristic qlc
    left join public.product_attribute pa on pa.id = qlc.attribute_id
    left join public.color col on col.id = qlc.color_id
   where qlc.quotation_line_id = p_quotation_line_id and qlc.color_id is not null
   limit 1;

  select p.code, p.commercial_description, p.technical_description, p.family_id
    into v_product_code, v_product_commercial, v_product_technical, v_family_id
    from public.product p where p.id = p_product_id;

  if v_family_id is not null then
    select coalesce(pf.recuttable, false), coalesce(pf.confectionable, false)
      into v_recuttable, v_confectionable
      from public.product_family pf where pf.id = v_family_id;
  end if;

  v_component_type := case
    when v_recuttable then 'PROFILE'
    when v_confectionable then 'LONA'
    else null
  end;

  return jsonb_build_object(
    'dimensions', v_dimensions,
    'characteristic_id', v_char_attribute_id,
    'characteristic_code', v_char_code,
    'characteristic_name', v_char_name,
    'color_id', v_color_id,
    'color_code', v_color_code,
    'color_name', v_color_name,
    'color_hex', v_color_hex,
    'components', jsonb_build_array(jsonb_build_object(
      'product_id', p_product_id,
      'product_code', v_product_code,
      'product_name', coalesce(v_product_commercial, v_product_technical, v_product_code),
      'component_type', v_component_type,
      'characteristic_id', v_char_attribute_id,
      'characteristic_code', v_char_code,
      'characteristic_name', v_char_name,
      'color_id', v_color_id,
      'color_code', v_color_code,
      'color_name', v_color_name,
      'color_hex', v_color_hex,
      'quantity', 1,
      'dimension_list', v_dimensions
    ))
  );
end;
$$;

-- Vuelve a derivar el snapshot de toda línea de artículo simple ya convertida (las líneas OTD
-- reales tienen siempre product_id nulo, así que nunca las toca), ahora con component_type.
update public.sales_order_line sol
set specific_data = coalesce(sol.specific_data, '{}'::jsonb)
  || jsonb_build_object('configuration_snapshot', public.build_simple_line_configuration_snapshot(sol.quotation_line_id, sol.product_id))
where sol.quotation_line_id is not null
  and sol.product_id is not null
  and public.build_simple_line_configuration_snapshot(sol.quotation_line_id, sol.product_id) is not null;

update public.delivery_note_line dnl
set specific_data = coalesce(dnl.specific_data, '{}'::jsonb) || jsonb_build_object('configuration_snapshot', sol.specific_data->'configuration_snapshot')
from public.sales_order_line sol
where sol.id = dnl.sales_order_line_id
  and sol.product_id is not null
  and sol.specific_data ? 'configuration_snapshot';
