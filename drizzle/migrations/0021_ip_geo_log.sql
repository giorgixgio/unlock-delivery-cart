CREATE TABLE public.ip_geo_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  ip text,
  geo_city text,
  geo_city_ka text,
  geo_region text,
  geo_country text,
  isp_org text,
  is_mobile boolean,
  provider text,
  lookup_status text NOT NULL DEFAULT 'ok',
  error_message text,
  was_under_review boolean NOT NULL DEFAULT false,
  final_city text,
  city_match boolean,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ip_geo_log TO service_role;
ALTER TABLE public.ip_geo_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX ip_geo_log_isp_idx ON public.ip_geo_log (isp_org);

CREATE OR REPLACE FUNCTION public.ip_geo_refresh(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  SELECT status, is_confirmed, review_required, city, normalized_city INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE ip_geo_log l SET
    geo_city_ka = COALESCE((SELECT a.canonical_city FROM city_aliases a WHERE a.alias_normalized = lower(trim(l.geo_city)) LIMIT 1), l.geo_city),
    was_under_review = l.was_under_review OR o.status = 'on_hold' OR COALESCE(o.review_required, false)
  WHERE l.order_id = p_order_id;
  IF o.is_confirmed OR o.status NOT IN ('new', 'pending_details', 'on_hold') THEN
    UPDATE ip_geo_log l SET
      final_city = COALESCE(NULLIF(trim(o.normalized_city), ''), NULLIF(trim(o.city), '')),
      city_match = CASE WHEN l.geo_city_ka IS NULL OR COALESCE(NULLIF(trim(o.normalized_city), ''), NULLIF(trim(o.city), '')) IS NULL THEN NULL
                        ELSE l.geo_city_ka = COALESCE(NULLIF(trim(o.normalized_city), ''), NULLIF(trim(o.city), '')) END,
      resolved_at = now()
    WHERE l.order_id = p_order_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.ip_geo_refresh(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ip_geo_after_log_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.ip_geo_refresh(NEW.order_id); RETURN NULL; END $$;
CREATE TRIGGER ip_geo_after_log_insert AFTER INSERT ON public.ip_geo_log
FOR EACH ROW EXECUTE FUNCTION public.ip_geo_after_log_insert();

CREATE OR REPLACE FUNCTION public.ip_geo_after_order_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.is_confirmed IS DISTINCT FROM OLD.is_confirmed
      OR NEW.review_required IS DISTINCT FROM OLD.review_required
      OR NEW.city IS DISTINCT FROM OLD.city OR NEW.normalized_city IS DISTINCT FROM OLD.normalized_city)
     AND EXISTS (SELECT 1 FROM ip_geo_log WHERE order_id = NEW.id) THEN
    BEGIN
      PERFORM public.ip_geo_refresh(NEW.id);
    EXCEPTION WHEN OTHERS THEN NULL; -- never block order updates
    END;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER ip_geo_after_order_update AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.ip_geo_after_order_update();