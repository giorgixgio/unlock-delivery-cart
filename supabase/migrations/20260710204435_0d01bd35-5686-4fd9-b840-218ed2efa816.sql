
DROP POLICY IF EXISTS "Anyone can create orders" ON public.orders;
CREATE POLICY "Anon can create orders" ON public.orders
  FOR INSERT TO anon
  WITH CHECK (
    COALESCE(is_confirmed, false) = false
    AND COALESCE(auto_confirmed, false) = false
    AND COALESCE(is_fulfilled, false) = false
    AND (status IS NULL OR status IN ('new','pending_details','pending_address'))
  );

DROP POLICY IF EXISTS "Anyone can insert idempotency_keys" ON public.idempotency_keys;
CREATE POLICY "Anon can insert idempotency_keys" ON public.idempotency_keys
  FOR INSERT TO anon
  WITH CHECK (
    idempotency_key IS NOT NULL
    AND action_type IS NOT NULL
    AND length(action_type) <= 100
  );

DROP POLICY IF EXISTS "Anyone can insert grid_events" ON public.grid_events;
CREATE POLICY "Anon can insert grid_events" ON public.grid_events
  FOR INSERT TO anon
  WITH CHECK (event_type IS NOT NULL AND length(event_type) <= 64);

DROP POLICY IF EXISTS "stockout_attempts_insert_any" ON public.stockout_attempts;
CREATE POLICY "stockout_attempts_insert_scoped" ON public.stockout_attempts
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    product_id IS NOT NULL AND length(product_id) <= 100
    AND (blocked_reason IS NULL OR blocked_reason = 'out_of_stock')
  );

REVOKE EXECUTE ON FUNCTION public.storefront_get_last_address_by_phone(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.storefront_recent_cities(int) FROM public;
REVOKE EXECUTE ON FUNCTION public.storefront_recent_addresses(int) FROM public;
REVOKE EXECUTE ON FUNCTION public.storefront_update_order_address(uuid, text, text, text, boolean, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.storefront_mark_address_skipped(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.storefront_apply_bump(uuid, text, text, text, int, numeric, numeric, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.storefront_log_order_event(uuid, text, text, jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.storefront_log_system_event(text, text, text, text, jsonb, text, text) FROM public;
REVOKE EXECUTE ON FUNCTION public.record_stockout_attempt(text, text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.record_stockout_attempt(text, text, text, text, jsonb) TO anon, authenticated;
