
-- Add blocked_reason + stock snapshot columns to stockout_attempts
ALTER TABLE public.stockout_attempts
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS stock_at_attempt integer,
  ADD COLUMN IF NOT EXISTS stock_status_at_attempt text;

CREATE INDEX IF NOT EXISTS stockout_attempts_blocked_reason_idx
  ON public.stockout_attempts(blocked_reason);

-- Drop legacy uuid overload (was replaced by text version)
DROP FUNCTION IF EXISTS public.record_stockout_attempt(uuid, text, text, jsonb);

-- Replace text overload to accept blocked_reason + stock snapshot
CREATE OR REPLACE FUNCTION public.record_stockout_attempt(
  p_product_id text,
  p_product_handle text,
  p_sku text,
  p_phone text,
  p_payload jsonb
)
RETURNS TABLE(id uuid, deduped boolean, attempt_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone_norm text;
  v_existing record;
  v_id uuid;
  v_attempt_count integer;
  v_blocked_reason text;
  v_stock_at_attempt integer;
  v_stock_status text;
BEGIN
  v_phone_norm := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF v_phone_norm = '' THEN v_phone_norm := NULL; END IF;

  v_blocked_reason := COALESCE(p_payload->>'blocked_reason', 'out_of_stock');
  v_stock_at_attempt := NULLIF(p_payload->>'stock_at_attempt','')::int;
  v_stock_status := p_payload->>'stock_status_at_attempt';

  -- Hard guard: only record true out-of-stock attempts
  IF v_blocked_reason <> 'out_of_stock' THEN
    RAISE EXCEPTION 'stockout_attempts only accepts blocked_reason=out_of_stock (got %)', v_blocked_reason;
  END IF;

  IF v_phone_norm IS NOT NULL AND p_product_id IS NOT NULL THEN
    SELECT s.id, s.attempt_count INTO v_existing
    FROM public.stockout_attempts s
    WHERE s.phone_normalized = v_phone_norm
      AND s.product_id = p_product_id
      AND s.blocked_reason = 'out_of_stock'
      AND s.last_attempt_at > now() - interval '24 hours'
    ORDER BY s.last_attempt_at DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.stockout_attempts AS s
      SET attempt_count = s.attempt_count + 1,
          last_attempt_at = now(),
          stock_at_attempt = COALESCE(v_stock_at_attempt, s.stock_at_attempt),
          stock_status_at_attempt = COALESCE(v_stock_status, s.stock_status_at_attempt),
          product_handle = COALESCE(s.product_handle, p_product_handle, p_payload->>'product_handle'),
          utm_source = COALESCE(s.utm_source, p_payload->>'utm_source'),
          utm_medium = COALESCE(s.utm_medium, p_payload->>'utm_medium'),
          utm_campaign = COALESCE(s.utm_campaign, p_payload->>'utm_campaign'),
          utm_content = COALESCE(s.utm_content, p_payload->>'utm_content'),
          utm_term = COALESCE(s.utm_term, p_payload->>'utm_term'),
          meta_campaign_id = COALESCE(s.meta_campaign_id, p_payload->>'meta_campaign_id'),
          meta_adset_id = COALESCE(s.meta_adset_id, p_payload->>'meta_adset_id'),
          meta_ad_id = COALESCE(s.meta_ad_id, p_payload->>'meta_ad_id'),
          fbclid = COALESCE(s.fbclid, p_payload->>'fbclid')
      WHERE s.id = v_existing.id
      RETURNING s.id, s.attempt_count INTO v_id, v_attempt_count;

      id := v_id;
      deduped := true;
      attempt_count := v_attempt_count;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.stockout_attempts (
    product_id, product_handle, sku, product_name, variant_id,
    phone_number, phone_normalized, quantity_attempted,
    landing_page_url, source,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    meta_campaign_id, meta_adset_id, meta_ad_id, fbclid,
    user_agent, session_id, ip_country,
    blocked_reason, stock_at_attempt, stock_status_at_attempt
  ) VALUES (
    p_product_id, COALESCE(p_product_handle, p_payload->>'product_handle'), p_sku, p_payload->>'product_name', p_payload->>'variant_id',
    p_phone, v_phone_norm, COALESCE((p_payload->>'quantity_attempted')::int, 1),
    p_payload->>'landing_page_url', p_payload->>'source',
    p_payload->>'utm_source', p_payload->>'utm_medium', p_payload->>'utm_campaign', p_payload->>'utm_content', p_payload->>'utm_term',
    p_payload->>'meta_campaign_id', p_payload->>'meta_adset_id', p_payload->>'meta_ad_id', p_payload->>'fbclid',
    p_payload->>'user_agent', p_payload->>'session_id', p_payload->>'ip_country',
    'out_of_stock', v_stock_at_attempt, v_stock_status
  )
  RETURNING stockout_attempts.id, stockout_attempts.attempt_count INTO v_id, v_attempt_count;

  id := v_id;
  deduped := false;
  attempt_count := v_attempt_count;
  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_stockout_attempt(text, text, text, text, jsonb) TO anon, authenticated, service_role;

-- Cleanup: delete legacy/false rows where we cannot prove the product was OOS at attempt time
DELETE FROM public.stockout_attempts WHERE blocked_reason IS NULL;
