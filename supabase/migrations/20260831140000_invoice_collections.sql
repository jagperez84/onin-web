-- Cobros: seguimiento de los plazos de pago (invoice_installment) a nivel de
-- gestión interna — no factura legal, solo saber qué queda pendiente de
-- cobrar y cuándo vence, y poder marcarlo como cobrado (parcial o total).
--
-- A diferencia de invoice/invoice_line (contenido fiscal, inmutable una vez
-- emitida — ver 20260831130000), el estado de cobro de un plazo es
-- información de gestión que cambia con el tiempo sin que eso reabra la
-- factura ni afecte a su huella/cadena. Por eso aquí sí se usa una política
-- de UPDATE normal (security invoker), igual que el resto del proyecto.

alter table public.invoice_installment add column if not exists status varchar(20) not null default 'PENDING';
alter table public.invoice_installment add column if not exists collected_amount numeric(15, 2);
alter table public.invoice_installment add column if not exists collected_date date;
alter table public.invoice_installment add column if not exists collected_notes text;
alter table public.invoice_installment add column if not exists updated_at timestamptz not null default now();

alter table public.invoice_installment drop constraint if exists invoice_installment_status_ck;
alter table public.invoice_installment add constraint invoice_installment_status_ck check (status in ('PENDING', 'COLLECTED'));

create index if not exists ix_invoice_installment_status on public.invoice_installment (status);
create index if not exists ix_invoice_installment_due_date on public.invoice_installment (due_date);

drop policy if exists invoice_installment_company_update on public.invoice_installment;
create policy invoice_installment_company_update on public.invoice_installment for update using (
  exists(select 1 from public.invoice i where i.id = invoice_id and i.company_id = (select company_id from public.user_account where auth_user_id = auth.uid()))
) with check (
  exists(select 1 from public.invoice i where i.id = invoice_id and i.company_id = (select company_id from public.user_account where auth_user_id = auth.uid()))
);
