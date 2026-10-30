ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sms_name text;
ALTER TABLE public.products ADD CONSTRAINT products_sms_name_len CHECK (sms_name IS NULL OR char_length(sms_name) <= 20);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS onway_planned_date date,
  ADD COLUMN IF NOT EXISTS onway_last_status text,
  ADD COLUMN IF NOT EXISTS onway_last_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS onway_problem_comment text,
  ADD COLUMN IF NOT EXISTS onway_problem_image text,
  ADD COLUMN IF NOT EXISTS onway_problem_at timestamptz,
  ADD COLUMN IF NOT EXISTS onway_problem_resolved_at timestamptz;

ALTER TABLE public.onway_webhook_log
  ADD COLUMN IF NOT EXISTS match_status text,
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER TABLE public.sms_logs DROP CONSTRAINT IF EXISTS sms_logs_type_check;
ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_type_check CHECK (type IN (
  'confirmation','fulfillment','review_request','lead_created','call_no_answer','call_no_answer_2',
  'order_confirmed','out_for_delivery','delivery_failed','delivery_failed_2'));

CREATE TABLE public.sms_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  order_number text NOT NULL,
  type text NOT NULL CHECK (type IN ('call_no_answer','order_confirmed','out_for_delivery','delivery_failed')),
  seq integer NOT NULL DEFAULT 1,
  send_after timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','skipped','failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_number, type, seq)
);
CREATE INDEX sms_queue_due_idx ON public.sms_queue (send_after) WHERE status = 'pending';
CREATE INDEX sms_queue_order_idx ON public.sms_queue (order_id);
GRANT SELECT ON public.sms_queue TO authenticated;
GRANT ALL ON public.sms_queue TO service_role;
ALTER TABLE public.sms_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view sms_queue" ON public.sms_queue FOR SELECT TO authenticated USING (public.is_active_admin(auth.uid()));

CREATE TABLE public.onway_status_map (
  status_id text PRIMARY KEY,
  status_name text,
  action text NOT NULL DEFAULT 'none' CHECK (action IN ('none','out_for_delivery','delivery_failed','delivered','pickup_problem')),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  seen_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.onway_status_map TO authenticated;
GRANT ALL ON public.onway_status_map TO service_role;
ALTER TABLE public.onway_status_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view status map" ON public.onway_status_map FOR SELECT TO authenticated USING (public.is_active_admin(auth.uid()));
CREATE POLICY "Admins edit status map" ON public.onway_status_map FOR UPDATE TO authenticated USING (public.is_active_admin(auth.uid())) WITH CHECK (public.is_active_admin(auth.uid()));

CREATE TABLE public.onway_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  tracking text NOT NULL,
  status_id text,
  status_name text,
  reason text,
  comment text,
  image text,
  planned_date date,
  event_time timestamptz,
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX onway_status_events_order_idx ON public.onway_status_events (order_id, event_time DESC);
GRANT SELECT ON public.onway_status_events TO authenticated;
GRANT ALL ON public.onway_status_events TO service_role;
ALTER TABLE public.onway_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view status events" ON public.onway_status_events FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

-- Queue helper: idempotent per (order_number, type, seq).
CREATE OR REPLACE FUNCTION public.sms_enqueue(p_order_id uuid, p_type text, p_max_seq integer, p_send_after timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_num text; v_seq integer;
BEGIN
  SELECT public_order_number INTO v_num FROM orders WHERE id = p_order_id;
  IF v_num IS NULL THEN RETURN false; END IF;
  SELECT coalesce(max(seq), 0) + 1 INTO v_seq FROM sms_queue WHERE order_number = v_num AND type = p_type;
  IF v_seq > p_max_seq THEN RETURN false; END IF;
  INSERT INTO sms_queue (order_id, order_number, type, seq, send_after)
  VALUES (p_order_id, v_num, p_type, v_seq, p_send_after) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.sms_enqueue(uuid, text, integer, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_enqueue(uuid, text, integer, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.sms_sequence_on_order_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF NEW.status IN ('canceled','cancelled','returned') AND OLD.status IS DISTINCT FROM NEW.status THEN
      UPDATE sms_queue SET status = 'skipped', last_error = 'order_' || NEW.status WHERE order_id = NEW.id AND status = 'pending';
    ELSIF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
      PERFORM sms_enqueue(NEW.id, 'order_confirmed', 1, now() + interval '5 minutes');
    ELSIF NEW.call_outcome = 'no_answer' AND NEW.status NOT IN ('confirmed','canceled','cancelled')
      AND (OLD.call_outcome IS DISTINCT FROM 'no_answer' OR NEW.call_attempt_count IS DISTINCT FROM OLD.call_attempt_count) THEN
      PERFORM sms_enqueue(NEW.id, 'call_no_answer', 2, now());
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sms sequence enqueue failed: %', SQLERRM; -- never block order updates
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_sms_sequence AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.sms_sequence_on_order_update();

INSERT INTO public.internal_job_secrets (name) VALUES ('sms_queue') ON CONFLICT DO NOTHING;