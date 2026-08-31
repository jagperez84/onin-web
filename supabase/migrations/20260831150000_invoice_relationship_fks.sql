-- PostgREST solo puede resolver un embed tipo `customer:customer_id(...)`
-- si existe una foreign key real en el esquema — no le basta con que la
-- columna se llame customer_id. invoice.customer_id/payment_method_id/
-- payment_term_id se crearon como bigint sueltos (igual que ya hacía
-- sales_order desde antes de esta carpeta de migraciones), lo que rompía
-- "Could not find a relationship between 'invoice' and 'customer_id'" al
-- generar una factura y consultarla con los embeds de invoiceService.ts.
--
-- payment_method_id/payment_term_id de quotation y sales_order tenían el
-- mismo hueco (esas tablas son anteriores a que existieran payment_method/
-- payment_term) — se añade también ahí para evitar el mismo fallo en cuanto
-- se embeban esas relaciones.

alter table public.invoice drop constraint if exists invoice_customer_fk;
alter table public.invoice add constraint invoice_customer_fk foreign key (customer_id) references public.customer(id);
alter table public.invoice drop constraint if exists invoice_payment_method_fk;
alter table public.invoice add constraint invoice_payment_method_fk foreign key (payment_method_id) references public.payment_method(id);
alter table public.invoice drop constraint if exists invoice_payment_term_fk;
alter table public.invoice add constraint invoice_payment_term_fk foreign key (payment_term_id) references public.payment_term(id);

alter table public.sales_order drop constraint if exists sales_order_payment_method_fk;
alter table public.sales_order add constraint sales_order_payment_method_fk foreign key (payment_method_id) references public.payment_method(id);
alter table public.sales_order drop constraint if exists sales_order_payment_term_fk;
alter table public.sales_order add constraint sales_order_payment_term_fk foreign key (payment_term_id) references public.payment_term(id);

alter table public.quotation drop constraint if exists quotation_payment_method_fk;
alter table public.quotation add constraint quotation_payment_method_fk foreign key (payment_method_id) references public.payment_method(id);
alter table public.quotation drop constraint if exists quotation_payment_term_fk;
alter table public.quotation add constraint quotation_payment_term_fk foreign key (payment_term_id) references public.payment_term(id);
