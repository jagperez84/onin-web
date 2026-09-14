-- Elimina upc/ptc de product y product_characteristic.
--
-- Tenían formulario completo (ficha de artículo y variante OTD) y columna en sus tablas
-- de listado, pero ningún consumidor: el motor de precio (productPricingService.ts) solo
-- lee pvp/price_increment de la característica, nunca upc/ptc; tampoco aparecen en el PDF
-- del presupuesto (quotationPdfService.ts) ni en ningún otro sitio de producción o stock.
-- Se rellenaban, se guardaban y se listaban sin afectar a nada.
alter table public.product drop column if exists upc;
alter table public.product drop column if exists ptc;
alter table public.product_characteristic drop column if exists upc;
alter table public.product_characteristic drop column if exists ptc;
