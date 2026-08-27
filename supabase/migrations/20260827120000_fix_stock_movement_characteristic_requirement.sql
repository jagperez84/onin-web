-- Fix register_stock_movement and reserve_stock to only require characteristic if product actually has active characteristics assigned

CREATE OR REPLACE FUNCTION public.register_stock_movement(
  p_company_id bigint,
  p_warehouse_id bigint,
  p_product_id bigint,
  p_quantity numeric,
  p_movement_type_code varchar,
  p_characteristic_id bigint DEFAULT NULL,
  p_reference varchar DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_movement_date timestamptz DEFAULT now(),
  p_transfer_group_id uuid DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_product public.product%ROWTYPE;
  v_warehouse public.warehouse%ROWTYPE;
  v_type public.stock_movement_type%ROWTYPE;
  v_stock public.warehouse_stock%ROWTYPE;
  v_signed numeric;
  v_movement_id bigint;
  v_has_characteristics boolean;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero';
  END IF;
  SELECT * INTO v_product FROM public.product WHERE id = p_product_id AND company_id = p_company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'El artículo no existe para la empresa indicada'; END IF;
  
  -- Auto-enable stock if not yet enabled so movement is not blocked
  IF NOT v_product.stock_enabled THEN
    UPDATE public.product SET stock_enabled = true WHERE id = p_product_id;
  END IF;

  SELECT * INTO v_warehouse FROM public.warehouse WHERE id = p_warehouse_id AND company_id = p_company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'El almacén no existe para la empresa indicada'; END IF;
  IF NOT v_warehouse.active THEN RAISE EXCEPTION 'El almacén está inactivo'; END IF;

  SELECT * INTO v_type FROM public.stock_movement_type WHERE company_id = p_company_id AND code = p_movement_type_code AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tipo de movimiento no válido: %', p_movement_type_code; END IF;

  IF p_characteristic_id IS NOT NULL THEN
    PERFORM 1 FROM public.product_characteristic pc WHERE pc.id = p_characteristic_id AND pc.product_id = p_product_id AND pc.deleted_at IS NULL AND pc.active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'La característica no pertenece al artículo o no está activa'; END IF;
  ELSIF v_product.include_stock_by_color THEN
    SELECT EXISTS (
      SELECT 1 FROM public.product_characteristic pc 
      WHERE pc.product_id = p_product_id AND pc.deleted_at IS NULL AND pc.active = true
    ) INTO v_has_characteristics;

    IF v_has_characteristics THEN
      RAISE EXCEPTION 'El artículo requiere característica para gestionar stock por color';
    END IF;
  END IF;

  v_signed := p_quantity * v_type.direction;
  SELECT * INTO v_stock FROM public.warehouse_stock WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id AND characteristic_id IS NOT DISTINCT FROM p_characteristic_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.warehouse_stock (warehouse_id, product_id, characteristic_id, quantity, reserved_quantity) 
    VALUES (p_warehouse_id, p_product_id, p_characteristic_id, 0, 0) 
    RETURNING * INTO v_stock;
  END IF;

  IF v_signed < 0 AND NOT v_product.allow_negative_stock AND (v_stock.quantity + v_signed) < 0 THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible físico: %', v_stock.quantity;
  END IF;

  UPDATE public.warehouse_stock SET quantity = quantity + v_signed, updated_at = now() WHERE id = v_stock.id;

  INSERT INTO public.stock_movement (company_id, warehouse_id, product_id, movement_type_id, characteristic_id, quantity, movement_date, reference, notes, transfer_group_id)
  VALUES (p_company_id, p_warehouse_id, p_product_id, v_type.id, p_characteristic_id, p_quantity, p_movement_date, p_reference, p_notes, p_transfer_group_id)
  RETURNING id INTO v_movement_id;

  RETURN v_movement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_stock(
  p_company_id bigint,
  p_warehouse_id bigint,
  p_product_id bigint,
  p_quantity numeric,
  p_characteristic_id bigint DEFAULT NULL,
  p_reference varchar DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE 
  v_product public.product%ROWTYPE; 
  v_warehouse public.warehouse%ROWTYPE; 
  v_stock public.warehouse_stock%ROWTYPE; 
  v_id bigint;
  v_has_characteristics boolean;
BEGIN
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor que cero'; END IF;
  SELECT * INTO v_product FROM public.product WHERE id = p_product_id AND company_id = p_company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'El artículo no existe para la empresa indicada'; END IF;
  SELECT * INTO v_warehouse FROM public.warehouse WHERE id = p_warehouse_id AND company_id = p_company_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'El almacén no existe para la empresa indicada'; END IF;
  IF NOT v_warehouse.active THEN RAISE EXCEPTION 'El almacén está inactivo'; END IF;

  IF p_characteristic_id IS NOT NULL THEN
    PERFORM 1 FROM public.product_characteristic pc WHERE pc.id = p_characteristic_id AND pc.product_id = p_product_id AND pc.deleted_at IS NULL AND pc.active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'La característica no pertenece al artículo o no está activa'; END IF;
  ELSIF v_product.include_stock_by_color THEN 
    SELECT EXISTS (
      SELECT 1 FROM public.product_characteristic pc 
      WHERE pc.product_id = p_product_id AND pc.deleted_at IS NULL AND pc.active = true
    ) INTO v_has_characteristics;

    IF v_has_characteristics THEN
      RAISE EXCEPTION 'El artículo requiere característica para reservar stock'; 
    END IF;
  END IF;

  SELECT * INTO v_stock FROM public.warehouse_stock WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id AND characteristic_id IS NOT DISTINCT FROM p_characteristic_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.warehouse_stock (warehouse_id, product_id, characteristic_id, quantity, reserved_quantity) VALUES (p_warehouse_id, p_product_id, p_characteristic_id, 0, 0) RETURNING * INTO v_stock;
  END IF;

  IF (v_stock.quantity - v_stock.reserved_quantity) < p_quantity AND NOT v_product.allow_negative_stock THEN
    RAISE EXCEPTION 'No hay saldo disponible para reservar. Disponible: %', (v_stock.quantity - v_stock.reserved_quantity);
  END IF;

  UPDATE public.warehouse_stock SET reserved_quantity = reserved_quantity + p_quantity, updated_at = now() WHERE id = v_stock.id;

  INSERT INTO public.stock_reservation (company_id, warehouse_id, product_id, characteristic_id, quantity, reference, notes, status)
  VALUES (p_company_id, p_warehouse_id, p_product_id, p_characteristic_id, p_quantity, p_reference, p_notes, 'ACTIVE')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
