alter table public.quotation
  add column if not exists billing_address_label varchar,
  add column if not exists billing_address_street varchar,
  add column if not exists billing_address_postal_code varchar,
  add column if not exists billing_address_city varchar,
  add column if not exists billing_address_region varchar,
  add column if not exists installation_address_label varchar,
  add column if not exists installation_address_street varchar,
  add column if not exists installation_address_postal_code varchar,
  add column if not exists installation_address_city varchar,
  add column if not exists installation_address_region varchar;
