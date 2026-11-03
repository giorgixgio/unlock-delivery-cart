CREATE OR REPLACE FUNCTION public.courier_feed_status()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN NOT (public.is_active_admin(auth.uid()) OR public.is_active_staff(auth.uid())) THEN NULL ELSE jsonb_build_object(
    'last_webhook_at', (SELECT max(received_at) FROM public.onway_webhook_log),
    'unmapped', coalesce((SELECT jsonb_agg(courier_status) FROM public.courier_status_map WHERE needs_review), '[]'::jsonb),
    'api_shipments', (SELECT count(*) FROM public.courier_shipments WHERE source = 'api'),
    'api_open', (SELECT count(*) FROM public.courier_shipments WHERE source = 'api'
                 AND coalesce(derived_state,'') NOT IN ('DELIVERED','FAILED_FINAL','RETURNED_FAILED','CANCELLED_EXCLUDED','RETURN_COLLECTED','RETURN_FAILED','RETURN_CANCELLED'))
  ) END
$$;
REVOKE ALL ON FUNCTION public.courier_feed_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_feed_status() TO authenticated, service_role;