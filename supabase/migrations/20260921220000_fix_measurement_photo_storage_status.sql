-- La subida de fotos de una medición está pensada para el momento en que el técnico asignado
-- está in situ midiendo, es decir con la medición en estado IN_PROGRESS (ver canEditPhotos en
-- src/modules/measurements/MeasurementDetail.tsx). Las políticas de storage.objects para el
-- bucket measurement-photos (20260817_0040_measurement_photos_v1.sql) nunca se actualizaron y
-- seguían exigiendo status='ASSIGNED' — el estado anterior al que se pasa justo al empezar a
-- medir — por lo que la subida fallaba siempre en el flujo real de trabajo.
drop policy if exists measurement_photos_insert_assigned on storage.objects;
drop policy if exists measurement_photos_delete_assigned on storage.objects;

create policy measurement_photos_insert_assigned on storage.objects
for insert to authenticated
with check (
  bucket_id = 'measurement-photos'
  and split_part(name, '/', 1) = 'measurements'
  and split_part(name, '/', 2) ~ '^[0-9]+$'
  and exists (
    select 1 from public.measurement m
    where m.id = split_part(name, '/', 2)::bigint
      and m.assigned_user_id = auth.uid()
      and m.assigned_mode = 'USER'
      and m.status = 'IN_PROGRESS'
  )
);

create policy measurement_photos_delete_assigned on storage.objects
for delete to authenticated
using (
  bucket_id = 'measurement-photos'
  and split_part(name, '/', 1) = 'measurements'
  and split_part(name, '/', 2) ~ '^[0-9]+$'
  and exists (
    select 1 from public.measurement m
    where m.id = split_part(name, '/', 2)::bigint
      and m.assigned_user_id = auth.uid()
      and m.assigned_mode = 'USER'
      and m.status = 'IN_PROGRESS'
  )
);
