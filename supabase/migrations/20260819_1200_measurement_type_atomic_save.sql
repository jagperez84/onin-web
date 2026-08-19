create or replace function public.upsert_measurement_type(
  p_company_id bigint,
  p_id bigint,
  p_code varchar,
  p_name varchar,
  p_dimension_count integer,
  p_result_unit_id bigint,
  p_result_decimals integer,
  p_calculation_type varchar,
  p_formula text,
  p_active boolean,
  p_dimensions jsonb
)
returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_id bigint;
  v_dimension_count integer;
begin
  if p_company_id is null then
    raise exception 'La empresa es obligatoria';
  end if;
  if nullif(trim(p_code), '') is null then
    raise exception 'El código es obligatorio';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'El nombre es obligatorio';
  end if;
  if p_dimension_count < 0 or p_dimension_count > 5 then
    raise exception 'El número de dimensiones debe estar entre 0 y 5';
  end if;
  if p_result_decimals < 0 or p_result_decimals > 6 then
    raise exception 'Los decimales del resultado deben estar entre 0 y 6';
  end if;

  v_dimension_count := jsonb_array_length(coalesce(p_dimensions, '[]'::jsonb));
  if v_dimension_count <> p_dimension_count then
    raise exception 'La definición de dimensiones no coincide con el número indicado';
  end if;

  if p_id is null then
    insert into public.measurement_type (
      company_id, code, name, dimension_count, result_unit_id,
      result_decimals, calculation_type, formula, active, deleted_at, deleted_by, updated_at
    ) values (
      p_company_id, trim(p_code), trim(p_name), p_dimension_count, p_result_unit_id,
      p_result_decimals, nullif(trim(p_calculation_type), ''), nullif(trim(p_formula), ''),
      coalesce(p_active, true), null, null, now()
    )
    returning id into v_id;
  else
    update public.measurement_type
       set code = trim(p_code),
           name = trim(p_name),
           dimension_count = p_dimension_count,
           result_unit_id = p_result_unit_id,
           result_decimals = p_result_decimals,
           calculation_type = nullif(trim(p_calculation_type), ''),
           formula = nullif(trim(p_formula), ''),
           active = coalesce(p_active, true),
           deleted_at = null,
           deleted_by = null,
           updated_at = now()
     where id = p_id
       and company_id = p_company_id
    returning id into v_id;

    if v_id is null then
      raise exception 'No se encontró el tipo de medida indicado para la empresa';
    end if;
  end if;

  delete from public.measurement_type_dimension
   where measurement_type_id = v_id;

  insert into public.measurement_type_dimension (
    measurement_type_id, dimension_number, code, name, unit_id, decimals
  )
  select
    v_id,
    d.dimension_number,
    trim(d.code),
    trim(d.name),
    d.unit_id,
    d.decimals
  from jsonb_to_recordset(coalesce(p_dimensions, '[]'::jsonb)) as d(
    dimension_number integer,
    code varchar,
    name varchar,
    unit_id bigint,
    decimals integer
  );

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un tipo de medida con ese código para la empresa';
end;
$$;
