-- Backfill de created_by/completed_by para documentos creados antes de aplicar
-- 20260915090000_document_audit_created_by.sql (o antes de que esa migración
-- llegase a ejecutarse en esta base). Sin este backfill esos registros se
-- quedan con el campo a null para siempre: create_lona_confection_work_sheet
-- y create_invoice_from_sales_order son idempotentes (si el documento ya
-- existe, devuelven el existente sin tocarlo) y complete_installation solo
-- actualiza instalaciones que aún no están COMPLETED, así que una vez
-- generado el documento no hay forma de que una llamada posterior rellene
-- el dato retroactivamente.
--
-- No hay forma de saber con certeza quién generó cada documento histórico,
-- así que se asigna al usuario más antiguo (menor id) de la empresa del
-- documento — asunción razonable en el entorno de demo actual, de un único
-- operador por empresa. Solo toca filas con el campo a null, por lo que es
-- seguro volver a ejecutar esta migración.

update public.quotation t
set created_by = (
  select ua.auth_user_id from public.user_account ua
  where ua.company_id = t.company_id and ua.auth_user_id is not null
  order by ua.id asc limit 1
)
where t.created_by is null;

update public.sales_order t
set created_by = (
  select ua.auth_user_id from public.user_account ua
  where ua.company_id = t.company_id and ua.auth_user_id is not null
  order by ua.id asc limit 1
)
where t.created_by is null;

update public.production_work_sheet t
set created_by = (
  select ua.auth_user_id from public.user_account ua
  where ua.company_id = t.company_id and ua.auth_user_id is not null
  order by ua.id asc limit 1
)
where t.created_by is null;

update public.delivery_note t
set created_by = (
  select ua.auth_user_id from public.user_account ua
  where ua.company_id = t.company_id and ua.auth_user_id is not null
  order by ua.id asc limit 1
)
where t.created_by is null;

update public.invoice t
set created_by = (
  select ua.auth_user_id from public.user_account ua
  where ua.company_id = t.company_id and ua.auth_user_id is not null
  order by ua.id asc limit 1
)
where t.created_by is null;

update public.installation t
set created_by = (
  select ua.auth_user_id from public.user_account ua
  where ua.company_id = t.company_id and ua.auth_user_id is not null
  order by ua.id asc limit 1
)
where t.created_by is null;

update public.installation t
set completed_by = (
  select ua.auth_user_id from public.user_account ua
  where ua.company_id = t.company_id and ua.auth_user_id is not null
  order by ua.id asc limit 1
)
where t.completed_by is null and t.status = 'COMPLETED';
