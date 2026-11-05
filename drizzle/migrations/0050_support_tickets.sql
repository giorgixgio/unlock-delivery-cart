-- Operator issue tickets (customer_requests kind 'operator_flag').
ALTER TABLE public.customer_requests DROP CONSTRAINT IF EXISTS customer_requests_kind_check;
ALTER TABLE public.customer_requests ADD CONSTRAINT customer_requests_kind_check CHECK (kind IN ('change_address','change_day','call_me','cancel_save','self_canceled','operator_flag'));
ALTER TABLE public.customer_requests DROP CONSTRAINT IF EXISTS customer_requests_status_check;
ALTER TABLE public.customer_requests ADD CONSTRAINT customer_requests_status_check CHECK (status IN ('open','in_review','waiting_customer','resolved','done'));
ALTER TABLE public.customer_requests
  ADD COLUMN IF NOT EXISTS assigned_to text,
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_customer_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_admin_update_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE public.customer_requests ADD CONSTRAINT customer_requests_resolution_check
  CHECK (resolution IS NULL OR resolution IN ('explained','tutorial_sent','replacement','refund','unreachable','other'));
CREATE INDEX IF NOT EXISTS customer_requests_order_idx ON public.customer_requests (order_id);
CREATE INDEX IF NOT EXISTS customer_requests_flag_open_idx ON public.customer_requests (created_at) WHERE kind = 'operator_flag' AND status IN ('open','in_review','waiting_customer');
CREATE UNIQUE INDEX IF NOT EXISTS customer_requests_one_open_flag ON public.customer_requests (order_id) WHERE kind = 'operator_flag' AND status IN ('open','in_review','waiting_customer');

CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.customer_requests(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('customer','operator','admin','system')),
  author text,
  body text NOT NULL CHECK (char_length(body) <= 1000),
  link_url text CHECK (link_url IS NULL OR char_length(link_url) <= 500),
  video_url text CHECK (video_url IS NULL OR char_length(video_url) <= 500),
  status_set text,
  notify_customer boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_ticket_messages_req_idx ON public.support_ticket_messages (request_id, created_at);
GRANT SELECT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read ticket messages" ON public.support_ticket_messages FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE TABLE public.support_ticket_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  sla_working_days integer NOT NULL DEFAULT 2 CHECK (sla_working_days BETWEEN 1 AND 14),
  working_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  tz text NOT NULL DEFAULT 'Asia/Tbilisi',
  ack_delay_min integer NOT NULL DEFAULT 5 CHECK (ack_delay_min BETWEEN 0 AND 1440),
  followup_working_days integer NOT NULL DEFAULT 1 CHECK (followup_working_days BETWEEN 0 AND 14),
  min_gap_min integer NOT NULL DEFAULT 30 CHECK (min_gap_min BETWEEN 0 AND 1440),
  max_auto_sms integer NOT NULL DEFAULT 3 CHECK (max_auto_sms BETWEEN 0 AND 10),
  quiet_from text NOT NULL DEFAULT '21:00' CHECK (quiet_from ~ '^\d{2}:\d{2}$'),
  quiet_to text NOT NULL DEFAULT '09:00' CHECK (quiet_to ~ '^\d{2}:\d{2}$'),
  sms_ack text NOT NULL DEFAULT 'Tqveni mimartva mivighet. Specialisti dagikavshirdebat {days} samushao dgheshi. Detalebi: {link} {store}',
  sms_followup text NOT NULL DEFAULT 'Jer kidev vmushaobt tqvens mimartvaze. Shegidzliat daamatot detalebi: {link} {store}',
  sms_update text NOT NULL DEFAULT 'Tqveni mimartva ganakhlda. Nakhet: {link} {store}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
INSERT INTO public.support_ticket_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT SELECT, UPDATE ON public.support_ticket_settings TO authenticated;
GRANT ALL ON public.support_ticket_settings TO service_role;
ALTER TABLE public.support_ticket_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read support settings" ON public.support_ticket_settings FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Admins edit support settings" ON public.support_ticket_settings FOR UPDATE TO authenticated USING (public.is_active_admin(auth.uid())) WITH CHECK (public.is_active_admin(auth.uid()));

-- Queue exclusion flag.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS support_hold boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.call_queue_is_open(o public.orders)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT o.status IN ('new','on_hold','pending_bump','pending_details')
    AND COALESCE(o.is_return, false) = false
    AND COALESCE(o.auto_confirmed, false) = false
    AND COALESCE(o.is_confirmed, false) = false
    AND COALESCE(o.is_fulfilled, false) = false
    AND COALESCE(o.support_hold, false) = false
    AND NOT (COALESCE(o.tags, '{}') @> ARRAY['test_sku'])
$$;

-- SMS types.
ALTER TABLE public.sms_queue DROP CONSTRAINT IF EXISTS sms_queue_type_check;
ALTER TABLE public.sms_queue ADD CONSTRAINT sms_queue_type_check CHECK (type IN ('call_no_answer','order_confirmed','out_for_delivery','delivery_failed','address_problem','support_ack','support_followup','support_update'));
ALTER TABLE public.sms_queue ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE INDEX IF NOT EXISTS sms_queue_request_idx ON public.sms_queue (request_id) WHERE request_id IS NOT NULL;
ALTER TABLE public.sms_logs DROP CONSTRAINT IF EXISTS sms_logs_type_check;
ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_type_check CHECK (type IN (
  'confirmation','fulfillment','review_request','lead_created','order_auto_confirmed','call_no_answer','call_no_answer_2',
  'order_confirmed','out_for_delivery','delivery_failed','delivery_failed_2','address_problem','address_problem_2')
  OR type ~ '^support_(ack|followup|update)(_[0-9]+)?$');

-- Helpers.
CREATE OR REPLACE FUNCTION public.support_add_working_days(p_ts timestamptz, p_n integer)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE s support_ticket_settings; d timestamptz := p_ts; n integer := greatest(p_n, 0);
BEGIN
  SELECT * INTO s FROM support_ticket_settings WHERE id = 1;
  IF array_length(coalesce(s.working_days,'{}'),1) IS NULL THEN RETURN p_ts + make_interval(days => n); END IF;
  WHILE n > 0 LOOP
    d := d + interval '1 day';
    IF extract(isodow FROM d AT TIME ZONE coalesce(s.tz,'Asia/Tbilisi'))::int = ANY (s.working_days) THEN n := n - 1; END IF;
  END LOOP;
  RETURN d;
END $$;

CREATE OR REPLACE FUNCTION public.support_quiet_shift(p_ts timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE s support_ticket_settings; loc timestamp; t time; qf time; qt time;
BEGIN
  SELECT * INTO s FROM support_ticket_settings WHERE id = 1;
  loc := p_ts AT TIME ZONE s.tz; t := loc::time; qf := s.quiet_from::time; qt := s.quiet_to::time;
  IF qf = qt THEN RETURN p_ts; END IF;
  IF qf > qt THEN -- overnight window, e.g. 21:00-09:00
    IF t >= qf THEN RETURN ((loc::date + 1) + qt) AT TIME ZONE s.tz; END IF;
    IF t < qt THEN RETURN (loc::date + qt) AT TIME ZONE s.tz; END IF;
  ELSIF t >= qf AND t < qt THEN RETURN (loc::date + qt) AT TIME ZONE s.tz;
  END IF;
  RETURN p_ts;
END $$;

CREATE OR REPLACE FUNCTION public.support_enqueue_sms(p_request_id uuid, p_type text, p_after timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s support_ticket_settings; r customer_requests; v_num text; v_seq int; v_last timestamptz; v_auto int; v_at timestamptz;
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
  SELECT max(send_after) INTO v_last FROM sms_queue WHERE request_id = p_request_id AND status IN ('pending','sending','sent');
  v_at := greatest(p_after, coalesce(v_last + make_interval(mins => s.min_gap_min), p_after));
  v_at := public.support_quiet_shift(v_at);
  SELECT coalesce(max(seq), 0) + 1 INTO v_seq FROM sms_queue WHERE order_number = v_num AND type = p_type;
  INSERT INTO sms_queue (order_id, order_number, type, seq, send_after, request_id)
  VALUES (r.order_id, v_num, p_type, v_seq, v_at, p_request_id) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.support_enqueue_sms(uuid, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_enqueue_sms(uuid, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.support_actor() RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_staff(auth.uid()) THEN RAISE EXCEPTION 'Staff only' USING ERRCODE = '42501'; END IF;
  RETURN coalesce(auth.jwt()->>'email', auth.uid()::text);
END $$;

CREATE OR REPLACE FUNCTION public.support_ticket_create(p_order_id uuid, p_reason text, p_text text, p_source text DEFAULT 'call_queue')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.support_actor(); s support_ticket_settings; v_id uuid; v_existing uuid;
BEGIN
  IF p_reason NOT IN ('cant_use','question','complaint','problematic','other') THEN RAISE EXCEPTION 'invalid reason'; END IF;
  IF char_length(coalesce(p_text,'')) > 200 THEN RAISE EXCEPTION 'comment too long'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT id INTO v_existing FROM customer_requests WHERE order_id = p_order_id AND kind = 'operator_flag' AND status IN ('open','in_review','waiting_customer');
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('id', v_existing, 'existing', true); END IF;
  SELECT * INTO s FROM support_ticket_settings WHERE id = 1;
  PERFORM set_config('app.call_queue_rpc', '1', true);
  UPDATE orders SET support_hold = true, next_call_after = NULL, queue_locked_by = NULL, queue_locked_until = NULL,
    tracking_token = coalesce(tracking_token, public.gen_tracking_token())
  WHERE id = p_order_id;
  INSERT INTO customer_requests (order_id, kind, priority, payload, status, sla_due_at, created_by)
  VALUES (p_order_id, 'operator_flag', false, jsonb_build_object('reason', p_reason, 'text', nullif(trim(p_text),''), 'by_operator', v_actor, 'source', p_source),
    'open', public.support_add_working_days(now(), s.sla_working_days), v_actor)
  RETURNING id INTO v_id;
  INSERT INTO support_ticket_messages (request_id, author_type, author, body)
  VALUES (v_id, 'operator', v_actor, coalesce(nullif(trim(p_text),''), '(' || p_reason || ')'));
  INSERT INTO order_events (order_id, actor, event_type, payload) VALUES (p_order_id, v_actor, 'support_ticket_created', jsonb_build_object('request_id', v_id, 'reason', p_reason));
  PERFORM public.support_enqueue_sms(v_id, 'support_ack', now() + make_interval(mins => s.ack_delay_min));
  IF s.followup_working_days > 0 THEN
    PERFORM public.support_enqueue_sms(v_id, 'support_followup', public.support_add_working_days(now(), s.followup_working_days));
  END IF;
  RETURN jsonb_build_object('id', v_id, 'existing', false);
END $$;

CREATE OR REPLACE FUNCTION public.support_ticket_post_update(p_request_id uuid, p_body text, p_link text, p_video text, p_status text, p_notify boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.support_actor(); v_sms boolean := false; r customer_requests;
BEGIN
  SELECT * INTO r FROM customer_requests WHERE id = p_request_id AND kind = 'operator_flag';
  IF r.id IS NULL THEN RAISE EXCEPTION 'ticket not found'; END IF;
  IF r.status IN ('resolved','done') THEN RAISE EXCEPTION 'ticket already resolved'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('in_review','waiting_customer') THEN RAISE EXCEPTION 'invalid status'; END IF;
  IF char_length(trim(coalesce(p_body,''))) = 0 THEN RAISE EXCEPTION 'empty update'; END IF;
  INSERT INTO support_ticket_messages (request_id, author_type, author, body, link_url, video_url, status_set, notify_customer)
  VALUES (p_request_id, 'admin', v_actor, trim(p_body), nullif(trim(p_link),''), nullif(trim(p_video),''), p_status, coalesce(p_notify,false));
  UPDATE customer_requests SET last_admin_update_at = now(), staff_seen_at = now(), status = coalesce(p_status, CASE WHEN status = 'open' THEN 'in_review' ELSE status END)
  WHERE id = p_request_id;
  IF coalesce(p_notify, false) THEN v_sms := public.support_enqueue_sms(p_request_id, 'support_update', now()); END IF;
  RETURN jsonb_build_object('ok', true, 'sms_queued', v_sms);
END $$;

CREATE OR REPLACE FUNCTION public.support_ticket_resolve(p_request_id uuid, p_resolution text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.support_actor();
BEGIN
  IF p_resolution NOT IN ('explained','tutorial_sent','replacement','refund','unreachable','other') THEN RAISE EXCEPTION 'invalid resolution'; END IF;
  UPDATE customer_requests SET status = 'resolved', resolution = p_resolution, resolved_at = now(), resolved_by = v_actor, staff_seen_at = now()
  WHERE id = p_request_id AND kind = 'operator_flag' AND status IN ('open','in_review','waiting_customer');
  IF NOT FOUND THEN RAISE EXCEPTION 'ticket not open'; END IF;
  INSERT INTO support_ticket_messages (request_id, author_type, author, body, status_set)
  VALUES (p_request_id, 'system', v_actor, 'Resolved: ' || p_resolution || coalesce(' — ' || nullif(trim(p_note),''), ''), 'resolved');
  UPDATE sms_queue SET status = 'skipped', last_error = 'ticket_resolved' WHERE request_id = p_request_id AND status = 'pending';
END $$;

CREATE OR REPLACE FUNCTION public.support_ticket_release(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.support_actor();
BEGIN
  PERFORM set_config('app.call_queue_rpc', '1', true);
  UPDATE orders SET support_hold = false WHERE id = p_order_id AND support_hold;
  IF FOUND THEN
    INSERT INTO order_events (order_id, actor, event_type, payload) VALUES (p_order_id, v_actor, 'support_released_to_queue', '{}'::jsonb);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.support_ticket_assign(p_request_id uuid, p_to text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.support_actor();
BEGIN
  UPDATE customer_requests SET assigned_to = nullif(trim(p_to),'') WHERE id = p_request_id AND kind = 'operator_flag';
  INSERT INTO support_ticket_messages (request_id, author_type, author, body) VALUES (p_request_id, 'system', v_actor, 'Assigned to ' || coalesce(nullif(trim(p_to),''), 'nobody'));
END $$;

CREATE OR REPLACE FUNCTION public.support_ticket_mark_seen(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.support_actor(); UPDATE customer_requests SET staff_seen_at = now() WHERE id = p_request_id; END $$;

REVOKE ALL ON FUNCTION public.support_ticket_create(uuid, text, text, text), public.support_ticket_post_update(uuid, text, text, text, text, boolean),
  public.support_ticket_resolve(uuid, text, text), public.support_ticket_release(uuid), public.support_ticket_assign(uuid, text), public.support_ticket_mark_seen(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_create(uuid, text, text, text), public.support_ticket_post_update(uuid, text, text, text, text, boolean),
  public.support_ticket_resolve(uuid, text, text), public.support_ticket_release(uuid), public.support_ticket_assign(uuid, text), public.support_ticket_mark_seen(uuid) TO authenticated, service_role;

-- Pending ticket SMS stop when the order is cancelled (sms_sequence trigger already skips all pending rows for the order).

-- Duplicate lead from a customer with an open ticket: hold it and note it on the ticket.
CREATE OR REPLACE FUNCTION public.support_hold_duplicate_lead()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req uuid; v_last9 text := right(regexp_replace(coalesce(NEW.customer_phone,''), '\D', '', 'g'), 9);
BEGIN
  BEGIN
    IF COALESCE(NEW.tags,'{}') @> ARRAY['test_sku'] THEN RETURN NEW; END IF;
    SELECT cr.id INTO v_req FROM customer_requests cr JOIN orders o ON o.id = cr.order_id
    WHERE cr.kind = 'operator_flag' AND cr.status IN ('open','in_review','waiting_customer') AND o.id <> NEW.id
      AND ((length(v_last9) = 9 AND o.phone_last9 = v_last9) OR (NEW.cookie_id_hash IS NOT NULL AND o.cookie_id_hash = NEW.cookie_id_hash))
    ORDER BY cr.created_at DESC LIMIT 1;
    IF v_req IS NULL THEN RETURN NEW; END IF;
    PERFORM set_config('app.call_queue_rpc', '1', true);
    UPDATE orders SET support_hold = true, tags = array_append(coalesce(tags,'{}'), 'support_duplicate') WHERE id = NEW.id;
    INSERT INTO support_ticket_messages (request_id, author_type, author, body)
    VALUES (v_req, 'system', 'system', 'Customer submitted a new lead #' || coalesce(NEW.public_order_number,'?') || ' at ' || to_char(now() AT TIME ZONE 'Asia/Tbilisi', 'HH24:MI'));
    UPDATE customer_requests SET last_customer_reply_at = now() WHERE id = v_req;
    INSERT INTO order_events (order_id, actor, event_type, payload) VALUES (NEW.id, 'system', 'support_duplicate_held', jsonb_build_object('request_id', v_req));
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'support_hold_duplicate_lead: %', SQLERRM;
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER support_hold_duplicate_lead AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.support_hold_duplicate_lead();
