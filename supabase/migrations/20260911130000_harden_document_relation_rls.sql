-- document_relation quedó pendiente en el hardening multi-tenant
-- (20260901100000), señalado explícitamente en su propio comentario final:
-- "document_relation will be hardened once document polymorphic ownership
-- is consolidated." Verificado en vivo (information_schema.columns): la
-- tabla solo tiene id, source_document_id, target_document_id y
-- relation_type — sin company_id propio, igual que asumía ya el script de
-- semillas demo (20260831204725_multi_company_demo_v8.sql:158-159), que
-- exige que ambos extremos pertenezcan a la misma sales_document de origen.
--
-- document_status (la otra tabla sin RLS) se deja intacta a propósito: es
-- catálogo global puro (id, code, name, sort_order, active — sin
-- company_id ni ninguna columna específica de empresa), confirmado también
-- en vivo.

alter table public.document_relation enable row level security;

drop policy if exists document_relation_company_access on public.document_relation;
create policy document_relation_company_access on public.document_relation for all using (
  exists(select 1 from public.sales_document d where d.id = source_document_id and d.company_id = public.current_company_id())
  and exists(select 1 from public.sales_document d where d.id = target_document_id and d.company_id = public.current_company_id())
) with check (
  exists(select 1 from public.sales_document d where d.id = source_document_id and d.company_id = public.current_company_id())
  and exists(select 1 from public.sales_document d where d.id = target_document_id and d.company_id = public.current_company_id())
);
