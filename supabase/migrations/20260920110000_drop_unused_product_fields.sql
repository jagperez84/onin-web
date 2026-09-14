-- Elimina tres columnas de product sin ningún efecto en el sistema.
--
-- discarded_size: se pasaba a cutCalculationService.calculateCuts (productCutSettings.
-- discarded_size) pero la función nunca la lee — solo usa minimum_remainder y smooth_cut
-- de ese mismo objeto. Tampoco tenía ningún campo en el formulario de artículo: no era
-- ni siquiera editable desde la UI.
--
-- cod_arb: igual que discarded_size — existe en el modelo con un valor por defecto en los
-- formularios, pero sin ningún <input> que lo exponga ni ningún consumidor.
--
-- monochrome: sí es editable (checkbox "Monocromo" junto a "Corte liso" en la ficha de
-- artículo, que da la falsa impresión de tener el mismo peso que smooth_cut), pero no lo
-- lee cutCalculationService.ts, lonaConfectionService.ts, workSheetService.ts ni ningún
-- RPC de stock. Se guarda y no afecta a nada.
alter table public.product drop column if exists discarded_size;
alter table public.product drop column if exists cod_arb;
alter table public.product drop column if exists monochrome;
