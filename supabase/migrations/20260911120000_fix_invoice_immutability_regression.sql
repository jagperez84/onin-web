-- La migración de endurecimiento multi-tenant (20260901100000) aplicó
-- políticas "for all" (select+insert+update+delete) de forma genérica a
-- varias tablas, incluyendo invoice_line, invoice_tax_breakdown e
-- invoice_installment. Esas tres tablas se diseñaron deliberadamente SIN
-- update/delete en 20260831120000_invoicing.sql y
-- 20260831130000_invoicing_legal_compliance.sql para sostener la
-- inmutabilidad legal de una factura ya emitida (preparación Veri*Factu /
-- cadena de hashes): la cabecera invoice no tiene política de UPDATE, pero
-- sus líneas, desglose de IVA y plazos de cobro sí pasaron a poder
-- editarse o borrarse directamente desde el cliente, lo que rompe esa
-- garantía aunque la cabecera siga protegida.
--
-- Esta migración retira solo esas tres políticas "for all" (las políticas
-- originales, más estrictas, de 20260831120000/20260831130000 siguen
-- vigentes y no se tocan). No afecta al resto de tablas que la migración
-- de endurecimiento protegió correctamente.

drop policy if exists invoice_line_company_access2 on public.invoice_line;
drop policy if exists invoice_tax_breakdown_company_access2 on public.invoice_tax_breakdown;
drop policy if exists invoice_installment_company_access2 on public.invoice_installment;

-- invoice_installment sí necesita UPDATE (marcar plazos cobrados/pendientes
-- desde src/services/sales/invoiceService.ts), pero no INSERT/DELETE desde
-- el cliente: se re-crea con el alcance correcto, ya que la versión
-- original (20260831120000) usaba el patrón antiguo por subconsulta y aquí
-- se deja alineada con current_company_id() como el resto de políticas
-- nuevas.
drop policy if exists invoice_installment_company_update on public.invoice_installment;
create policy invoice_installment_company_update on public.invoice_installment for update using (
  exists(select 1 from public.invoice i where i.id = invoice_id and i.company_id = public.current_company_id())
) with check (
  exists(select 1 from public.invoice i where i.id = invoice_id and i.company_id = public.current_company_id())
);
