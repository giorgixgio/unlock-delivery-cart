CREATE OR REPLACE FUNCTION public.telegram_operator_daily_stats(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(operator text, first_activity timestamptz, last_activity timestamptz, calls bigint, reviewed bigint, confirmed bigint, cancelled bigint, no_answer bigint, callback bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH staff AS (SELECT email FROM public.admin_users WHERE role='operator' AND is_active),
ce AS (SELECT e.* FROM public.order_events e JOIN staff s ON s.email=e.actor WHERE e.created_at >= p_from AND e.created_at < p_to AND e.event_type='call_outcome' AND COALESCE(e.payload->>'source','') <> 'duplicate_cleanup'),
ss AS (SELECT os.* FROM public.operator_order_sessions os JOIN staff s ON s.email=os.operator WHERE os.session_started_at >= p_from AND os.session_started_at < p_to),
activity AS (SELECT actor AS operator, created_at AS at FROM ce UNION ALL SELECT operator, session_started_at FROM ss),
last_final AS (SELECT DISTINCT ON (actor,order_id) actor,order_id,payload->>'outcome' AS outcome FROM ce WHERE payload->>'outcome' IN ('confirmed','cancelled') ORDER BY actor,order_id,created_at DESC,id DESC),
reviewed_orders AS (SELECT actor AS operator, order_id FROM ce UNION SELECT operator,order_id FROM ss WHERE had_meaningful_action)
SELECT s.email, (SELECT min(at) FROM activity a WHERE a.operator=s.email), (SELECT max(at) FROM activity a WHERE a.operator=s.email),
(SELECT count(*) FROM ce WHERE actor=s.email), (SELECT count(*) FROM reviewed_orders r WHERE r.operator=s.email),
(SELECT count(*) FROM last_final WHERE actor=s.email AND outcome='confirmed'), (SELECT count(*) FROM last_final WHERE actor=s.email AND outcome='cancelled'),
(SELECT count(*) FROM ce WHERE actor=s.email AND payload->>'outcome'='no_answer'), (SELECT count(*) FROM ce WHERE actor=s.email AND payload->>'outcome'='callback')
FROM staff s ORDER BY s.email;
$$;
REVOKE ALL ON FUNCTION public.telegram_operator_daily_stats(timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_operator_daily_stats(timestamptz,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.dispatch_telegram_owner_alert(p_body jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_secret text; v_url text; v_id bigint;
BEGIN
 SELECT value INTO v_secret FROM public.site_settings WHERE key='telegram_alert_secret';
 SELECT value INTO v_url FROM public.site_settings WHERE key='telegram_alert_url';
 IF v_secret IS NULL OR v_url IS NULL THEN RETURN NULL; END IF;
 SELECT net.http_post(url:=v_url, headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',v_secret), body:=p_body, timeout_milliseconds:=10000) INTO v_id;
 RETURN v_id;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Telegram dispatch failed: %',SQLERRM; RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_telegram_owner_alert(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_telegram_owner_alert(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_telegram_new_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.merged_into_order_id IS NOT NULL OR NEW.is_return OR NEW.status <> 'pending_details' THEN RETURN NEW; END IF;
 PERFORM public.dispatch_telegram_owner_alert(jsonb_build_object('type','order_created','order_id',NEW.id));
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_telegram_bulk_fulfilled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor text;
BEGIN
 IF NEW.status IN ('completed','partial') AND OLD.status='applying' AND NEW.applied_at IS NOT NULL THEN
 SELECT email INTO v_actor FROM public.admin_users WHERE id=auth.uid();
 PERFORM public.dispatch_telegram_owner_alert(jsonb_build_object('type','bulk_fulfilled','batch_id',NEW.id,'actor',COALESCE(v_actor,NEW.created_by,'unknown')));
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.notify_telegram_bulk_fulfilled() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER telegram_bulk_fulfilled AFTER UPDATE OF status ON public.import_batches FOR EACH ROW EXECUTE FUNCTION public.notify_telegram_bulk_fulfilled();