-- Una característica de sistema (product_attribute) ya no distingue "tipo de dato"
-- (TEXT/NUMBER/BOOLEAN/OPTION) ni tiene su propia lista de valores nombrados
-- (product_attribute_value): a partir de ahora se relaciona únicamente con colores
-- (attribute_color). product_attribute_value y las columnas históricas de
-- quotation_line_characteristic (attribute_value_id/value_text/value_number/
-- value_boolean) se conservan intactas para no alterar presupuestos ya emitidos —
-- simplemente dejan de usarse para selecciones nuevas, que a partir de ahora se
-- guardan en la nueva columna color_id.
alter table public.product_attribute drop column if exists data_type;

alter table public.quotation_line_characteristic
  add column if not exists color_id bigint references public.color(id);

alter table public.quotation_line_characteristic
  drop constraint if exists quotation_line_characteristic_value_ck;
alter table public.quotation_line_characteristic
  add constraint quotation_line_characteristic_value_ck check (
    num_nonnulls(value_text, value_number, value_boolean, attribute_value_id, color_id) = 1
  );
