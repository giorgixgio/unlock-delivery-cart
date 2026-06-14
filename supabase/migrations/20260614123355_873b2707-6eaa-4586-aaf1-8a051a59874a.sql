ALTER TABLE public.stockout_attempts ALTER COLUMN product_id TYPE text USING product_id::text;
ALTER TABLE public.stockout_attempts ADD COLUMN IF NOT EXISTS product_handle text;

CREATE OR REPLACE FUNCTION public.record_stockout_attempt(p_product_id text, p_product_handle text, p_sku text, p_phone text, p_payload jsonb)
RETURNS TABLE(id uuid, deduped boolean, attempt_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_phone_norm text;
  v_existing record;
  v_id uuid;
  v_count integer;
BEGIN
  v_phone_norm := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  IF v_phone_norm = '' THEN v_phone_norm := NULL; END IF;

  IF v_phone_norm IS NOT NULL AND p_product_id IS NOT NULL THEN
    SELECT s.id, s.attempt_count INTO v_existing
    FROM public.stockout_attempts s
    WHERE s.phone_normalized = v_phone_norm
      AND s.product_id = p_product_id
      AND s.last_attempt_at > now() - interval '24 hours'
    ORDER BY s.last_attempt_at DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.stockout_attempts
      SET attempt_count = attempt_count + 1,
          last_attempt_at = now(),
          product_handle = COALESCE(stockout_attempts.product_handle, p_product_handle, p_payload->>'product_handle'),
          utm_source = COALESCE(utm_source, p_payload->>'utm_source'),
          utm_medium = COALESCE(utm_medium, p_payload->>'utm_medium'),
          utm_campaign = COALESCE(utm_campaign, p_payload->>'utm_campaign'),
          utm_content = COALESCE(utm_content, p_payload->>'utm_content'),
          utm_term = COALESCE(utm_term, p_payload->>'utm_term'),
          meta_campaign_id = COALESCE(meta_campaign_id, p_payload->>'meta_campaign_id'),
          meta_adset_id = COALESCE(meta_adset_id, p_payload->>'meta_adset_id'),
          meta_ad_id = COALESCE(meta_ad_id, p_payload->>'meta_ad_id'),
          fbclid = COALESCE(fbclid, p_payload->>'fbclid')
      WHERE stockout_attempts.id = v_existing.id
      RETURNING stockout_attempts.id, stockout_attempts.attempt_count INTO v_id, v_count;

      id := v_id; deduped := true; attempt_count := v_count;
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  INSERT INTO public.stockout_attempts (
    product_id, product_handle, sku, product_name, variant_id,
    phone_number, phone_normalized, quantity_attempted,
    landing_page_url, source,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    meta_campaign_id, meta_adset_id, meta_ad_id, fbclid,
    user_agent, session_id, ip_country
  ) VALUES (
    p_product_id, COALESCE(p_product_handle, p_payload->>'product_handle'), p_sku, p_payload->>'product_name', p_payload->>'variant_id',
    p_phone, v_phone_norm, COALESCE((p_payload->>'quantity_attempted')::int, 1),
    p_payload->>'landing_page_url', p_payload->>'source',
    p_payload->>'utm_source', p_payload->>'utm_medium', p_payload->>'utm_campaign', p_payload->>'utm_content', p_payload->>'utm_term',
    p_payload->>'meta_campaign_id', p_payload->>'meta_adset_id', p_payload->>'meta_ad_id', p_payload->>'fbclid',
    p_payload->>'user_agent', p_payload->>'session_id', p_payload->>'ip_country'
  )
  RETURNING stockout_attempts.id, stockout_attempts.attempt_count INTO v_id, v_count;

  id := v_id; deduped := false; attempt_count := v_count;
  RETURN NEXT;
END;
$$;