-- Descuento comercial de cliente a nivel de OTD, además de los ya existentes
-- por familia y por artículo: hasta ahora una línea de presupuesto generada
-- desde un OTD (configurador técnico) no tenía product_id y por tanto nunca
-- recibía ningún descuento de cliente (customerProductDiscount necesita un
-- product_id). Con esto un cliente puede tener:
--   - un descuento genérico que se aplica a TODOS los OTD (otd_id NULL);
--   - descuentos específicos para un OTD concreto, que prevalecen sobre el
--     genérico para ese OTD (no son sumatorios).
--
-- Orden de prioridad al calcular una línea de OTD (ver customerOtdDiscount en
-- quotationCreationRepository.ts): OTD específico > artículo (si el OTD está
-- vinculado a un producto) > familia de ese producto > OTD genérico.

create table if not exists public.customer_otd_discount (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.company(id),
  customer_party_id bigint not null references public.party(id),
  otd_id bigint references public.otd(id),
  discount_percent numeric not null check (discount_percent >= 0 and discount_percent <= 100),
  active boolean not null default true,
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un único descuento genérico (otd_id NULL) por cliente, y un único descuento
-- específico por cliente+OTD; ambos ignorando las filas ya marcadas como
-- borradas para poder volver a crear una tras "eliminar" la anterior.
create unique index if not exists customer_otd_discount_generic_uq
  on public.customer_otd_discount(customer_party_id)
  where otd_id is null and deleted_at is null;
create unique index if not exists customer_otd_discount_specific_uq
  on public.customer_otd_discount(customer_party_id, otd_id)
  where otd_id is not null and deleted_at is null;

alter table public.customer_otd_discount enable row level security;

drop policy if exists customer_otd_discount_company_access on public.customer_otd_discount;
create policy customer_otd_discount_company_access on public.customer_otd_discount
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
