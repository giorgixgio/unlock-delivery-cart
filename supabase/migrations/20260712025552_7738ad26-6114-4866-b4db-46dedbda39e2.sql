
CREATE OR REPLACE FUNCTION public.storefront_update_order_upsell(
  p_order_id uuid,
  p_subtotal numeric,
  p_shipping_fee numeric,
  p_total numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET subtotal = p_subtotal,
      shipping_fee = p_shipping_fee,
      total = p_total
  WHERE id = p_order_id
    AND created_at > now() - interval '24 hours'
    AND COALESCE(is_confirmed, false) = false
    AND COALESCE(is_fulfilled, false) = false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.storefront_update_order_upsell(uuid, numeric, numeric, numeric) TO anon, authenticated;
