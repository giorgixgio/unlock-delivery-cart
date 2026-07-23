
CREATE TABLE IF NOT EXISTS public.duplicate_block_events (
  id uuid primary key default gen_random_uuid(),
  phone_normalized text,
  sku text,
  existing_order_id uuid,
  blocked_at timestamptz not null default now()
);
GRANT SELECT ON public.duplicate_block_events TO authenticated;
GRANT ALL ON public.duplicate_block_events TO service_role;
ALTER TABLE public.duplicate_block_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins can read duplicate_block_events" ON public.duplicate_block_events;
CREATE POLICY "admins can read duplicate_block_events"
  ON public.duplicate_block_events FOR SELECT TO authenticated
  USING (public.is_active_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_dupe_block_phone_sku_time
  ON public.duplicate_block_events (phone_normalized, sku, blocked_at DESC);

CREATE OR REPLACE FUNCTION public.storefront_check_duplicate_order(
  p_phone text, p_sku text, p_hours integer DEFAULT 3
)
RETURNS TABLE(order_id uuid, order_number text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last9 text;
  v_id uuid;
  v_num text;
  v_ts timestamptz;
BEGIN
  v_last9 := right(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g'), 9);
  IF length(v_last9) < 9 OR coalesce(p_sku,'') = '' THEN
    RETURN;
  END IF;

  SELECT o.id, o.public_order_number, o.created_at
    INTO v_id, v_num, v_ts
  FROM public.orders o
  WHERE o.customer_phone ILIKE '%' || v_last9
    AND o.created_at > now() - make_interval(hours => greatest(p_hours, 1))
    AND coalesce(o.status,'') NOT IN ('cancelled','merged')
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = o.id AND oi.sku = p_sku
    )
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.duplicate_block_events (phone_normalized, sku, existing_order_id)
  VALUES (v_last9, p_sku, v_id);

  order_id := v_id;
  order_number := v_num;
  created_at := v_ts;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.storefront_check_duplicate_order(text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.storefront_check_duplicate_order(text, text, integer) TO anon, authenticated, service_role;
