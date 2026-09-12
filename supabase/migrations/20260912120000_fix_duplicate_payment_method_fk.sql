-- Corrige el error en vivo: "Could not embed because more than one
-- relationship was found for 'quotation' and 'payment_method_id'".
--
-- La migración 20260831150000_invoice_relationship_fks.sql asumía que
-- quotation.payment_method_id / payment_term_id (y sus equivalentes en
-- sales_order e invoice) eran columnas bigint sueltas sin ninguna FK, y
-- añadió una constraint nueva con nombre propio (quotation_payment_method_fk,
-- etc.). Si esas columnas ya tenían otra FK con distinto nombre (p. ej.
-- creada antes a mano desde el editor de tablas de Supabase), ahora hay DOS
-- relaciones entre las mismas tablas y PostgREST no puede resolver el embed
-- `payment_method:payment_method_id(...)` sin ambigüedad.
--
-- Este script localiza dinámicamente cualquier FK "extra" (de una sola
-- columna) sobre estos pares tabla/columna, distinta de la constraint
-- canónica que ya crea 20260831150000, y la elimina. Si no hay duplicados no
-- hace nada — es seguro volver a ejecutarlo.

do $$
declare
  t text[];
  r record;
  targets text[][] := array[
    array['quotation', 'payment_method_id', 'quotation_payment_method_fk'],
    array['quotation', 'payment_term_id', 'quotation_payment_term_fk'],
    array['sales_order', 'payment_method_id', 'sales_order_payment_method_fk'],
    array['sales_order', 'payment_term_id', 'sales_order_payment_term_fk'],
    array['invoice', 'customer_id', 'invoice_customer_fk'],
    array['invoice', 'payment_method_id', 'invoice_payment_method_fk'],
    array['invoice', 'payment_term_id', 'invoice_payment_term_fk']
  ];
begin
  foreach t slice 1 in array targets loop
    for r in
      select con.conname
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace nsp on nsp.oid = rel.relnamespace
        join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
       where nsp.nspname = 'public'
         and rel.relname = t[1]
         and con.contype = 'f'
         and array_length(con.conkey, 1) = 1
         and att.attname = t[2]
         and con.conname <> t[3]
    loop
      execute format('alter table public.%I drop constraint %I', t[1], r.conname);
    end loop;
  end loop;
end $$;
