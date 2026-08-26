-- warehouse_stock now supports independent stock balances by characteristic.
-- Remove the legacy uniqueness constraint that allowed only one balance per
-- warehouse/product regardless of characteristic.
ALTER TABLE public.warehouse_stock
  DROP CONSTRAINT IF EXISTS warehouse_stock_warehouse_id_product_id_key;
