-- Corrige el error en vivo al crear una medición: "new row violates row-level
-- security policy for table measurement".
--
-- create_measurement(p_company_id, ...) confiaba en que el llamador le pasara
-- un company_id válido, pero MeasurementCreate.tsx/MeasurementDetail.tsx
-- siempre lo llaman como createMeasurement(null, {...}) — p_company_id ha
-- sido null desde siempre. Esto no daba ningún error mientras la política de
-- inserción en `measurement` era permisiva (with check(auth.uid() is not
-- null), de 20260816_1220_measurement_expedition_upgrade.sql), pero
-- 20260901100000_harden_multi_tenant_rls.sql la sustituyó por
-- with check(company_id = public.current_company_id()) — y company_id=null
-- nunca es igual a current_company_id(), así que el insert empezó a fallar.
--
-- El resto de RPCs de creación de este tipo (create_delivery_note_for_lines,
-- complete_installation...) resuelven company_id a partir de una fila padre
-- ya protegida por RLS, no de un parámetro suelto — una medición no tiene esa
-- fila padre, así que la corrección aquí es resolver el company_id del propio
-- usuario autenticado con current_company_id(), igual que hace ya el resto
-- del esquema hardened, ignorando el p_company_id que mande el cliente.

create or replace function public.create_measurement(
  p_company_id bigint,
  p_reference varchar,
  p_customer_id bigint,
  p_customer_name varchar,
  p_customer_tax_id varchar,
  p_customer_phone varchar,
  p_customer_mobile varchar,
  p_customer_email varchar,
  p_site_street varchar,
  p_site_postal_code varchar,
  p_site_city varchar,
  p_site_region varchar,
  p_site_country_code varchar,
  p_contact_method varchar,
  p_commercial_name varchar,
  p_assigned_user_id uuid,
  p_assigned_mode varchar,
  p_status varchar,
  p_contact_date date,
  p_measurement_date date,
  p_measurement_time time,
  p_observations text
) returns bigint
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  v_company_id bigint := public.current_company_id();
  v_year integer := extract(year from coalesce(p_measurement_date,p_contact_date,current_date));
  v_number bigint;
  v_id bigint;
  v_user uuid := auth.uid();
begin
  if v_company_id is null then raise exception 'El usuario no tiene empresa asignada'; end if;
  if coalesce(trim(p_customer_name),'')='' then raise exception 'El cliente es obligatorio'; end if;
  if p_contact_date is null then raise exception 'La fecha de contacto es obligatoria'; end if;
  if p_assigned_mode='USER' and p_assigned_user_id is null then raise exception 'Debe indicar el medidor asignado'; end if;
  insert into public.measurement_sequence(company_id,year,last_number) values(v_company_id,v_year,1)
  on conflict(company_id,year) do update set last_number=public.measurement_sequence.last_number+1
  returning last_number into v_number;
  insert into public.measurement(company_id,year,number,code,reference,customer_id,customer_name_snapshot,customer_tax_id_snapshot,customer_phone_snapshot,customer_mobile_snapshot,customer_email_snapshot,site_street,site_postal_code,site_city,site_region,site_country_code,contact_method,commercial_name,assigned_user_id,assigned_mode,status,contact_date,measurement_date,measurement_time,notes,observations,created_by,updated_by)
  values(v_company_id,v_year,v_number,'M-'||v_year||'-'||lpad(v_number::text,6,'0'),nullif(trim(p_reference),''),p_customer_id,nullif(trim(p_customer_name),''),nullif(trim(p_customer_tax_id),''),nullif(trim(p_customer_phone),''),nullif(trim(p_customer_mobile),''),nullif(trim(p_customer_email),''),nullif(trim(p_site_street),''),nullif(trim(p_site_postal_code),''),nullif(trim(p_site_city),''),nullif(trim(p_site_region),''),coalesce(nullif(trim(p_site_country_code),''),'ES'),nullif(trim(p_contact_method),''),nullif(trim(p_commercial_name),''),p_assigned_user_id,coalesce(p_assigned_mode,'UNASSIGNED'),coalesce(p_status,'PLANNED'),p_contact_date,p_measurement_date,p_measurement_time,nullif(trim(p_observations),''),nullif(trim(p_observations),''),v_user,v_user)
  returning id into v_id;
  insert into public.measurement_activity(measurement_id,event_type,message,created_by) values(v_id,'CREATED','Medición creada',v_user);
  return v_id;
end;
$$;
