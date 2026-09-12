-- Jornadas de trabajo e incidencias de montaje.
--
-- Hasta ahora una instalación era una única fecha/hora de inicio y fin — válido para
-- un montaje de un día, pero un toldo grande (pérgola bioclimática, varias lonas...)
-- puede necesitar varias visitas en días distintos, y durante cualquiera de ellas
-- puede surgir un problema que conviene dejar registrado (no solo en el campo libre
-- de notas). Se añaden dos conceptos nuevos, sin tocar installation_line:
--
--   - installation_session: una jornada de trabajo concreta (fecha, horario, notas).
--   - installation_incident: algo que ha salido mal durante el montaje, con
--     gravedad y si está resuelto o no.
--
-- installation.status gana dos valores intermedios: IN_PROGRESS (ya se ha trabajado
-- al menos una jornada pero no se ha completado) y BLOCKED (una incidencia grave ha
-- detenido el trabajo). end_time/actual_duration del registro de installation siguen
-- siendo el resumen final de todo el montaje; cada jornada tiene los suyos propios.

alter table public.installation drop constraint if exists installation_status_ck;
alter table public.installation add constraint installation_status_ck
  check (status in ('SCHEDULED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'));

create table if not exists public.installation_session (
  id bigint generated always as identity primary key,
  installation_id bigint not null references public.installation(id) on delete cascade,
  session_date date not null,
  start_time varchar(10),
  end_time varchar(10),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists ix_installation_session_installation on public.installation_session (installation_id, session_date);

create table if not exists public.installation_incident (
  id bigint generated always as identity primary key,
  installation_id bigint not null references public.installation(id) on delete cascade,
  session_id bigint references public.installation_session(id) on delete set null,
  severity varchar(10) not null default 'MEDIUM',
  description text not null,
  status varchar(10) not null default 'OPEN',
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  constraint installation_incident_severity_ck check (severity in ('LOW', 'MEDIUM', 'HIGH')),
  constraint installation_incident_status_ck check (status in ('OPEN', 'RESOLVED'))
);
create index if not exists ix_installation_incident_installation on public.installation_incident (installation_id, status);

alter table public.installation_session enable row level security;
drop policy if exists installation_session_company_access on public.installation_session;
create policy installation_session_company_access on public.installation_session for all
  using (exists(select 1 from public.installation i where i.id = installation_id and i.company_id = public.current_company_id()))
  with check (exists(select 1 from public.installation i where i.id = installation_id and i.company_id = public.current_company_id()));

alter table public.installation_incident enable row level security;
drop policy if exists installation_incident_company_access on public.installation_incident;
create policy installation_incident_company_access on public.installation_incident for all
  using (exists(select 1 from public.installation i where i.id = installation_id and i.company_id = public.current_company_id()))
  with check (exists(select 1 from public.installation i where i.id = installation_id and i.company_id = public.current_company_id()));

-- Registra una jornada de trabajo. Si la instalación estaba SCHEDULED o BLOCKED
-- (una incidencia había detenido el trabajo y se retoma), pasa a IN_PROGRESS.
create or replace function public.add_installation_session(
  p_installation_id bigint,
  p_session_date date,
  p_start_time varchar default null,
  p_end_time varchar default null,
  p_notes text default null
) returns bigint
language plpgsql
security invoker
as $$
declare
  v_status varchar;
  v_id bigint;
begin
  select status into v_status from public.installation where id = p_installation_id;
  if v_status is null then
    raise exception 'La instalación no existe';
  end if;
  if v_status in ('COMPLETED', 'CANCELLED') then
    raise exception 'No se pueden registrar jornadas en una instalación % ', v_status;
  end if;

  insert into public.installation_session (installation_id, session_date, start_time, end_time, notes)
  values (p_installation_id, p_session_date, p_start_time, p_end_time, p_notes)
  returning id into v_id;

  if v_status in ('SCHEDULED', 'BLOCKED') then
    update public.installation set status = 'IN_PROGRESS', updated_at = now() where id = p_installation_id;
  end if;

  return v_id;
end;
$$;
grant execute on function public.add_installation_session(bigint, date, varchar, varchar, text) to authenticated;

-- Reporta una incidencia. Si es grave (HIGH), detiene la instalación (BLOCKED) hasta
-- que se registre una nueva jornada retomando el trabajo.
create or replace function public.report_installation_incident(
  p_installation_id bigint,
  p_severity varchar,
  p_description text,
  p_session_id bigint default null
) returns bigint
language plpgsql
security invoker
as $$
declare
  v_status varchar;
  v_id bigint;
begin
  select status into v_status from public.installation where id = p_installation_id;
  if v_status is null then
    raise exception 'La instalación no existe';
  end if;
  if v_status in ('COMPLETED', 'CANCELLED') then
    raise exception 'No se pueden registrar incidencias en una instalación %', v_status;
  end if;
  if p_description is null or trim(p_description) = '' then
    raise exception 'Describe la incidencia';
  end if;

  insert into public.installation_incident (installation_id, session_id, severity, description)
  values (p_installation_id, p_session_id, coalesce(p_severity, 'MEDIUM'), p_description)
  returning id into v_id;

  if p_severity = 'HIGH' then
    update public.installation set status = 'BLOCKED', updated_at = now() where id = p_installation_id;
  end if;

  return v_id;
end;
$$;
grant execute on function public.report_installation_incident(bigint, varchar, text, bigint) to authenticated;

create or replace function public.resolve_installation_incident(
  p_incident_id bigint,
  p_resolution_notes text default null
) returns void
language sql
security invoker
as $$
  update public.installation_incident
     set status = 'RESOLVED', resolved_at = now(), resolution_notes = p_resolution_notes
   where id = p_incident_id and status = 'OPEN';
$$;
grant execute on function public.resolve_installation_incident(bigint, text) to authenticated;

-- Permite completar una instalación en cualquiera de sus estados de trabajo (antes
-- solo se podía si estaba SCHEDULED — un montaje multi-día que ya está IN_PROGRESS,
-- o retomado tras una incidencia (BLOCKED), también debe poder cerrarse).
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
     set status = 'COMPLETED', end_time = p_end_time, actual_duration = p_actual_duration, updated_at = now()
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
   where id = v_order_id and status <> 'CANCELLED';

  return v_delivery_note_id;
end;
$$;
