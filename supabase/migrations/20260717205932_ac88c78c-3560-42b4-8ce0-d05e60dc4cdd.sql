
CREATE OR REPLACE FUNCTION public.storefront_add_upsell_items(
  p_order_id uuid,
  p_items jsonb,
  p_subtotal numeric,
  p_shipping_fee numeric,
  p_total numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
  v_item jsonb;
BEGIN
  SELECT (created_at > now() - interval '2 hours' AND COALESCE(is_fulfilled, false) = false)
    INTO v_ok FROM public.orders WHERE id = p_order_id;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'order not eligible for upsell';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.order_items (
      order_id, product_id, sku, title, quantity, unit_price, line_total, image_url, tags
    ) VALUES (
      p_order_id,
      v_item->>'product_id',
      v_item->>'sku',
      v_item->>'title',
      COALESCE((v_item->>'quantity')::int, 1),
      (v_item->>'unit_price')::numeric,
      (v_item->>'line_total')::numeric,
      COALESCE(v_item->>'image_url', ''),
      ARRAY['upsell']
    );
  END LOOP;

  UPDATE public.orders
  SET subtotal = p_subtotal,
      shipping_fee = p_shipping_fee,
      total = p_total,
      tags = COALESCE(tags, ARRAY[]::text[]) || ARRAY['upsell_accepted']
  WHERE id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.storefront_add_upsell_items(uuid, jsonb, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storefront_add_upsell_items(uuid, jsonb, numeric, numeric, numeric) TO anon, authenticated;
