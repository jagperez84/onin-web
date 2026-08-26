alter table public.quotation
  add column if not exists contact_id bigint references public.contact(id) on delete set null,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

create index if not exists idx_quotation_contact_id on public.quotation(contact_id);

comment on column public.quotation.contact_id is 'Optional reference to customer contact';
comment on column public.quotation.contact_name is 'Contact person name for this quotation (editable at quotation level)';
comment on column public.quotation.contact_email is 'Contact email for this quotation used for sending documents (editable at quotation level)';
comment on column public.quotation.contact_phone is 'Contact phone for this quotation (editable at quotation level)';
