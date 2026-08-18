alter table public.quotation
  add column if not exists billing_address_label text,
  add column if not exists billing_address_street text,
  add column if not exists billing_address_postal_code varchar(20),
  add column if not exists billing_address_city text,
  add column if not exists billing_address_region text,
  add column if not exists installation_address_label text,
  add column if not exists installation_address_street text,
  add column if not exists installation_address_postal_code varchar(20),
  add column if not exists installation_address_city text,
  add column if not exists installation_address_region text;
