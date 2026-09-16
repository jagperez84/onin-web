-- createQuotation() (src/services/sales/quotationCreationRepository.ts) calcula el
-- siguiente number de presupuesto en cliente: lee el máximo number de
-- (company_id, year) y le suma 1, sin ningún lock. Dos comerciales creando un
-- presupuesto a la vez para la misma empresa/año pueden leer el mismo máximo y
-- generar dos presupuestos con el mismo code (año/número) — no había ninguna
-- restricción en BD que lo impidiera, así que el duplicado quedaba silencioso.
--
-- Se añade la restricción única que debería haber existido desde el principio.
-- El cliente sigue calculando el number de la misma forma (no se toca ese flujo
-- más amplio), pero ahora un choque concurrente falla con un error claro
-- (23505) que el cliente puede detectar y reintentar con el siguiente number.
create unique index if not exists uq_quotation_company_year_number
  on public.quotation (company_id, year, number);
