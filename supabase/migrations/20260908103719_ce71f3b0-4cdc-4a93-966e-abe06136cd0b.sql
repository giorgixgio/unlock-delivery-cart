CREATE OR REPLACE FUNCTION public.bulk_fulfill_orders(
  p_rows jsonb,
  p_batch_id uuid,
  p_source_file text,
  p_actor text DEFAULT 'admin'
)
RETURNS TABLE(applied_order_ids uuid[], conflicted_order_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_applied uuid[] := ARRAY[]::uuid[];
  v_conflicted uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  CREATE TEMP TABLE _bf_incoming ON COMMIT DROP AS
  SELECT (elem->>'order_id')::uuid AS order_id,
         NULLIF(btrim(elem->>'tracking_number'), '') AS tracking_number,
         NULLIF(btrim(elem->>'order_ref'), '') AS order_ref
  FROM jsonb_array_elements(p_rows) AS elem
  WHERE (elem->>'order_id') IS NOT NULL
    AND NULLIF(btrim(elem->>'tracking_number'), '') IS NOT NULL;

  CREATE TEMP TABLE _bf_updated ON COMMIT DROP AS
  WITH snap AS (
    SELECT i.order_id, i.tracking_number, i.order_ref, o.version, o.status AS before_status
    FROM _bf_incoming i
    JOIN public.orders o ON o.id = i.order_id
  ),
  upd AS (
    UPDATE public.orders o
    SET tracking_number = s.tracking_number,
        is_fulfilled = true,
        status = CASE WHEN o.status IN ('confirmed','new','on_hold') THEN 'shipped' ELSE o.status END,
        courier_name = COALESCE(o.courier_name, 'Onway'),
        version = COALESCE(o.version, 0) + 1,
        updated_at = now()
    FROM snap s
    WHERE o.id = s.order_id
      AND COALESCE(o.version, 0) = COALESCE(s.version, 0)
    RETURNING o.id
  )
  SELECT s.order_id, s.tracking_number, s.order_ref, s.before_status
  FROM snap s
  WHERE s.order_id IN (SELECT id FROM upd);

  INSERT INTO public.order_events (order_id, actor, event_type, payload)
  SELECT u.order_id, p_actor, 'tracking_import_mass_fulfill',
         jsonb_build_object('tracking', u.tracking_number, 'order_ref', u.order_ref, 'source_file', p_source_file)
  FROM _bf_updated u;

  INSERT INTO public.system_events (entity_type, entity_id, event_type, actor_id, payload_json, status)
  SELECT 'import_batch', p_batch_id::text, 'COURIER_IMPORT_APPLY', p_actor,
         jsonb_build_object('order_id', u.order_id, 'tracking', u.tracking_number,
                            'source_file', p_source_file, 'before_status', u.before_status),
         'SUCCESS'
  FROM _bf_updated u;

  UPDATE public.import_staging_rows r
  SET applied = true, applied_at = now(), match_status = 'applied'
  FROM _bf_updated u
  WHERE r.batch_id = p_batch_id AND r.matched_order_id = u.order_id;

  SELECT COALESCE(array_agg(order_id), ARRAY[]::uuid[]) INTO v_applied FROM _bf_updated;
  SELECT COALESCE(array_agg(i.order_id), ARRAY[]::uuid[]) INTO v_conflicted
  FROM _bf_incoming i
  WHERE i.order_id NOT IN (SELECT order_id FROM _bf_updated);

  DROP TABLE IF EXISTS _bf_incoming;
  DROP TABLE IF EXISTS _bf_updated;

  applied_order_ids := v_applied;
  conflicted_order_ids := v_conflicted;
  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.bulk_fulfill_orders(jsonb, uuid, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.bulk_fulfill_orders(jsonb, uuid, text, text) TO authenticated, service_role;