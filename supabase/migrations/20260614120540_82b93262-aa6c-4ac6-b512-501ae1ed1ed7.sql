
-- Stockout demand tracking
CREATE TABLE IF NOT EXISTS public.stockout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),

  product_id uuid,
  sku text,
  product_name text,
  variant_id text,

  phone_number text,
  phone_normalized text,
  quantity_attempted integer NOT NULL DEFAULT 1,

  landing_page_url text,
  source text,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,

  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  fbclid text,

  user_agent text,
  session_id text,
  ip_country text,

  attempt_count integer NOT NULL DEFAULT 1,
  waitlist_requested boolean NOT NULL DEFAULT false,

  status text NOT NULL DEFAULT 'unresolved',
  reviewed_by text,
  reviewed_at timestamptz,
  note text
);

CREATE INDEX IF NOT EXISTS idx_stockout_attempts_product_last ON public.stockout_attempts (product_id, last_attempt_at DESC);
CREATE INDEX IF NOT EXISTS idx_stockout_attempts_status_last ON public.stockout_attempts (status, last_attempt_at DESC);
CREATE INDEX IF NOT EXISTS idx_stockout_attempts_phone_product ON public.stockout_attempts (phone_normalized, product_id, last_attempt_at DESC);
CREATE INDEX IF NOT EXISTS idx_stockout_attempts_sku_last ON public.stockout_attempts (sku, last_attempt_at DESC);

GRANT INSERT ON public.stockout_attempts TO anon, authenticated;
GRANT SELECT, UPDATE ON public.stockout_attempts TO authenticated;
GRANT ALL ON public.stockout_attempts TO service_role;

ALTER TABLE public.stockout_attempts ENABLE ROW LEVEL SECURITY;

-- Anyone (anon/auth) may insert (landing-page submit). Read/update reserved for active admins.
CREATE POLICY "stockout_attempts_insert_any"
  ON public.stockout_attempts FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "stockout_attempts_admin_select"
  ON public.stockout_attempts FOR SELECT
  TO authenticated
  USING (public.is_active_admin(auth.uid()));

CREATE POLICY "stockout_attempts_admin_update"
  ON public.stockout_attempts FOR UPDATE
  TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

-- Atomic dedup + insert/update RPC
CREATE OR REPLACE FUNCTION public.record_stockout_attempt(
  p_product_id uuid,
  p_sku text,
  p_phone text,
  p_payload jsonb
)
RETURNS TABLE(id uuid, deduped boolean, attempt_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    product_id, sku, product_name, variant_id,
    phone_number, phone_normalized, quantity_attempted,
    landing_page_url, source,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    meta_campaign_id, meta_adset_id, meta_ad_id, fbclid,
    user_agent, session_id, ip_country
  ) VALUES (
    p_product_id, p_sku, p_payload->>'product_name', p_payload->>'variant_id',
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

GRANT EXECUTE ON FUNCTION public.record_stockout_attempt(uuid, text, text, jsonb) TO anon, authenticated, service_role;

-- Lightweight waitlist toggle, also callable anonymously (only sets the bool).
CREATE OR REPLACE FUNCTION public.mark_stockout_waitlist(p_attempt_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.stockout_attempts SET waitlist_requested = true WHERE id = p_attempt_id;
$$;

GRANT EXECUTE ON FUNCTION public.mark_stockout_waitlist(uuid) TO anon, authenticated, service_role;
