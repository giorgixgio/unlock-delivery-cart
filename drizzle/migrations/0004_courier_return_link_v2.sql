-- Normalized item-set key for courier comment items (code:qty set, order independent)
CREATE OR REPLACE FUNCTION public.courier_items_key(p jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT string_agg(k, '|' ORDER BY k)
    FROM (
      SELECT (x.code || ':' || x.qty) AS k
      FROM jsonb_to_recordset(COALESCE(p, '[]'::jsonb)) AS x(code text, qty int)
    ) t
  ), '');
$$;

-- Return-linking v2: exact item-set match first, one-to-one, phone-only fallback
-- only when there is exactly one candidate. Placeholder phone 555555555 is never a key.
CREATE OR REPLACE FUNCTION public.courier_link_returns(p_trackings text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exact int := 0;
  v_phone int := 0;
  v_total int := 0;
BEGIN
  SELECT count(*) INTO v_total FROM public.courier_shipments
   WHERE tracking_number = ANY(p_trackings) AND is_return = true;

  CREATE TEMP TABLE _ret ON COMMIT DROP AS
  SELECT r.tracking_number AS ret_tn,
         r.phone_normalized AS phone,
         public.courier_items_key(r.comment_items) AS ikey,
         COALESCE(r.order_date, r.latest_status_date, r.status_changed_at) AS rdate
  FROM public.courier_shipments r
  WHERE r.tracking_number = ANY(p_trackings)
    AND r.is_return = true
    AND r.phone_normalized IS NOT NULL
    AND r.phone_normalized <> ''
    AND r.phone_normalized <> '555555555'
    AND r.linked_original_tracking_number IS NULL;

  CREATE TEMP TABLE _cand ON COMMIT DROP AS
  SELECT o.tracking_number AS orig_tn,
         o.phone_normalized AS phone,
         public.courier_items_key(o.comment_items) AS ikey,
         o.order_date AS odate,
         o.original_order_id
  FROM public.courier_shipments o
  WHERE o.is_return = false
    AND o.phone_normalized IS NOT NULL
    AND o.phone_normalized <> ''
    AND o.phone_normalized <> '555555555'
    AND o.linked_return_tracking_number IS NULL;

  -- pass 1: phone + exact item set + date order
  CREATE TEMP TABLE _pick ON COMMIT DROP AS
  SELECT DISTINCT ON (orig_tn) ret_tn, orig_tn, original_order_id
  FROM (
    SELECT DISTINCT ON (r.ret_tn) r.ret_tn, c.orig_tn, c.original_order_id, c.odate
    FROM _ret r
    JOIN _cand c
      ON c.phone = r.phone
     AND c.ikey = r.ikey
     AND c.ikey <> ''
     AND (c.odate IS NULL OR r.rdate IS NULL OR c.odate <= r.rdate)
    ORDER BY r.ret_tn, c.odate DESC NULLS LAST
  ) s
  ORDER BY orig_tn, odate DESC NULLS LAST;

  GET DIAGNOSTICS v_exact = ROW_COUNT;

  -- pass 2: phone only, exactly one remaining candidate for that return
  INSERT INTO _pick (ret_tn, orig_tn, original_order_id)
  SELECT r.ret_tn, c.orig_tn, c.original_order_id
  FROM _ret r
  JOIN LATERAL (
    SELECT c.orig_tn, c.original_order_id, count(*) OVER () AS n
    FROM _cand c
    WHERE c.phone = r.phone
      AND (c.odate IS NULL OR r.rdate IS NULL OR c.odate <= r.rdate)
      AND c.orig_tn NOT IN (SELECT orig_tn FROM _pick)
  ) c ON c.n = 1
  WHERE r.ret_tn NOT IN (SELECT ret_tn FROM _pick);

  GET DIAGNOSTICS v_phone = ROW_COUNT;

  UPDATE public.courier_shipments s
  SET linked_original_tracking_number = p.orig_tn,
      original_order_id = COALESCE(s.original_order_id, p.original_order_id)
  FROM _pick p
  WHERE s.tracking_number = p.ret_tn;

  UPDATE public.courier_shipments s
  SET linked_return_tracking_number = p.ret_tn
  FROM _pick p
  WHERE s.tracking_number = p.orig_tn;

  RETURN jsonb_build_object(
    'linked_exact', v_exact,
    'linked_phone_only', v_phone,
    'unlinked', GREATEST(v_total - (v_exact + v_phone), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.courier_link_returns(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_link_returns(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.courier_items_key(jsonb) TO authenticated, service_role;