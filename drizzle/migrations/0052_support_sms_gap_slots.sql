-- Find the first time slot at or after the requested time that is at least min_gap away from every other ticket text.
CREATE OR REPLACE FUNCTION public.support_enqueue_sms(p_request_id uuid, p_type text, p_after timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s support_ticket_settings; r customer_requests; v_num text; v_seq int; v_near timestamptz; v_auto int; v_at timestamptz; v_gap interval; i int := 0;
BEGIN
  SELECT * INTO s FROM support_ticket_settings WHERE id = 1;
  IF NOT coalesce(s.enabled, false) THEN RETURN false; END IF;
  SELECT * INTO r FROM customer_requests WHERE id = p_request_id;
  IF r.id IS NULL OR r.status NOT IN ('open','in_review','waiting_customer') THEN RETURN false; END IF;
  SELECT public_order_number INTO v_num FROM orders WHERE id = r.order_id AND status NOT IN ('canceled','cancelled');
  IF v_num IS NULL THEN RETURN false; END IF;
  IF p_type IN ('support_ack','support_followup') THEN
    SELECT count(*) INTO v_auto FROM sms_queue WHERE request_id = p_request_id AND type IN ('support_ack','support_followup') AND status <> 'skipped';
    IF v_auto >= s.max_auto_sms THEN RETURN false; END IF;
  END IF;
  v_gap := make_interval(mins => s.min_gap_min);
  v_at := public.support_quiet_shift(p_after);
  LOOP
    i := i + 1;
    SELECT max(coalesce(sent_at, send_after)) INTO v_near FROM sms_queue
    WHERE request_id = p_request_id AND status IN ('pending','sending','sent')
      AND coalesce(sent_at, send_after) > v_at - v_gap AND coalesce(sent_at, send_after) < v_at + v_gap;
    EXIT WHEN v_near IS NULL OR i > 20;
    v_at := public.support_quiet_shift(v_near + v_gap);
  END LOOP;
  SELECT coalesce(max(seq), 0) + 1 INTO v_seq FROM sms_queue WHERE order_number = v_num AND type = p_type;
  INSERT INTO sms_queue (order_id, order_number, type, seq, send_after, request_id)
  VALUES (r.order_id, v_num, p_type, v_seq, v_at, p_request_id) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.support_enqueue_sms(uuid, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_enqueue_sms(uuid, text, timestamptz) TO service_role;
