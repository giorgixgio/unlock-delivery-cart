ALTER TABLE public.wholesale_items ADD COLUMN IF NOT EXISTS shipping_mark text;
COMMENT ON COLUMN public.wholesale_items.shipping_mark IS 'Carton mark for reorders; existing storefront product SKU is reused while wholesale row SKU stays unique.';

CREATE OR REPLACE FUNCTION public.create_wholesale_item(p_batch_id uuid)
RETURNS public.wholesale_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_batch public.wholesale_batches;
  v_seq integer;
  v_sku text;
  v_row public.wholesale_items;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT * INTO v_batch FROM public.wholesale_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_batch.id IS NULL THEN RAISE EXCEPTION 'batch not found'; END IF;

  IF v_batch.warehouse = 'B' THEN
    -- Serialize allocation across batches; storefront SKUs are the source of truth too.
    PERFORM pg_advisory_xact_lock(4656, 1);
    SELECT GREATEST(
      COALESCE((SELECT MAX(substring(sku FROM '^G888-T4656-([0-9]+)$')::integer)
        FROM public.products WHERE sku ~ '^G888-T4656-[0-9]+$'), 0),
      COALESCE((SELECT MAX(substring(sku FROM '^G888-T4656-([0-9]+)$')::integer)
        FROM public.wholesale_items WHERE sku ~ '^G888-T4656-[0-9]+$'), 0)
    ) + 1 INTO v_seq;
    v_sku := 'G888-T4656-' || lpad(v_seq::text, 4, '0');
  ELSE
    SELECT COALESCE(MAX(substring(i.sku FROM ('^' || v_batch.warehouse || '-' || v_batch.batch_number || '-([0-9]+)$'))::integer), 0) + 1
      INTO v_seq
    FROM public.wholesale_items i
    WHERE i.batch_id = p_batch_id AND i.sku ~ ('^' || v_batch.warehouse || '-' || v_batch.batch_number || '-[0-9]+$');
    v_sku := v_batch.warehouse || '-' || v_batch.batch_number || '-' || lpad(v_seq::text, 3, '0');
  END IF;

  INSERT INTO public.wholesale_items (batch_id, warehouse, sku)
  VALUES (p_batch_id, v_batch.warehouse, v_sku)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.create_wholesale_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_wholesale_item(uuid) TO authenticated, service_role;