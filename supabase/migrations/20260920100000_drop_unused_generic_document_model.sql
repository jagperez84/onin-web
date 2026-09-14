-- Elimina el subsistema genérico de documentos (tipo + serie + correlativo) que nunca
-- llegó a usar la aplicación real.
--
-- document_type/document_series estaban pensados como el sistema de numeración de
-- sales_document/purchase_document (documento genérico con tipo, serie y un contador
-- next_number), pero presupuestos, pedidos, facturas y albaranes se implementaron como
-- tablas dedicadas (quotation, sales_order, invoice, delivery_note), cada una con su
-- propia función de numeración por año (generate_sales_order_code, generate_invoice_code,
-- generate_delivery_note_code) que calcula el siguiente número a partir del código máximo
-- ya usado — ninguna de las cuatro llega a tocar document_series.next_number.
--
-- document_relation (relación origen/destino entre documentos) solo tenía sentido sobre
-- sales_document, así que cae con él. Confirmado: cero referencias en src/ a
-- document_type, document_series, sales_document, sales_document_line, sales_document_otd,
-- purchase_document, purchase_document_line o document_relation — ni repositorio, ni
-- pantalla, ni RPC de la aplicación los usa.
--
-- document_status se deja intacta a propósito: es un catálogo global independiente
-- (id, code, name, sort_order, active — sin company_id), sin relación con este subsistema.
drop table if exists public.document_relation cascade;
drop table if exists public.sales_document_otd cascade;
drop table if exists public.sales_document_line cascade;
drop table if exists public.sales_document cascade;
drop table if exists public.purchase_document_line cascade;
drop table if exists public.purchase_document cascade;
drop table if exists public.document_series cascade;
drop table if exists public.document_type cascade;
