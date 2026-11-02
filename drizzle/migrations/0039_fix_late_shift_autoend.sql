CREATE OR REPLACE FUNCTION public.call_queue_autoend_shifts()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.call_queue_settings := public.call_queue_cfg(); s record; v_last timestamptz; v_n int := 0;
  v_now_l timestamp := now() AT TIME ZONE 'Asia/Tbilisi';
  v_cut time;
BEGIN
  IF NOT public.is_active_staff(auth.uid()) THEN RETURN 0; END IF;
  v_cut := c.work_end::time + interval '1 hour';
  FOR s IN SELECT * FROM public.operator_shifts WHERE ended_at IS NULL FOR UPDATE SKIP LOCKED LOOP
    SELECT greatest(s.started_at, s.updated_at,
      (SELECT max(e.created_at) FROM public.order_events e WHERE e.created_at >= s.started_at AND lower(e.actor) = lower(s.operator)),
      (SELECT max(greatest(x.session_started_at, coalesce(x.session_ended_at, x.session_started_at))) FROM public.operator_order_sessions x
        WHERE x.session_started_at >= s.started_at AND lower(x.operator) = lower(s.operator)))
    INTO v_last;
    IF (s.started_at AT TIME ZONE 'Asia/Tbilisi')::date < v_now_l::date
       OR (v_now_l::time > v_cut AND (s.started_at AT TIME ZONE 'Asia/Tbilisi')::time <= v_cut)
       OR (NOT s.paused AND v_last < now() - interval '60 minutes') THEN
      UPDATE public.operator_shifts SET ended_at = least(v_last, now()), auto_ended = true, paused = false, updated_at = now() WHERE id = s.id;
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END $function$;