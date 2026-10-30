ALTER TABLE public.sms_logs DROP CONSTRAINT IF EXISTS sms_logs_type_check;
ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_type_check CHECK (type IN (
  'confirmation','fulfillment','review_request','lead_created','order_auto_confirmed','call_no_answer','call_no_answer_2',
  'order_confirmed','out_for_delivery','delivery_failed','delivery_failed_2','address_problem','address_problem_2'));
-- One first text per order: lead_created OR order_auto_confirmed, never both.
CREATE UNIQUE INDEX IF NOT EXISTS sms_logs_first_text_uniq ON public.sms_logs (order_number) WHERE type IN ('lead_created','order_auto_confirmed');

ALTER TABLE public.sms_queue DROP CONSTRAINT IF EXISTS sms_queue_type_check;
ALTER TABLE public.sms_queue ADD CONSTRAINT sms_queue_type_check CHECK (type IN ('call_no_answer','order_confirmed','out_for_delivery','delivery_failed','address_problem'));

ALTER TABLE public.onway_status_events
  ADD COLUMN IF NOT EXISTS ai_reason text,
  ADD COLUMN IF NOT EXISTS ai_confidence real,
  ADD COLUMN IF NOT EXISTS ai_summary text;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS onway_problem_reason text,
  ADD COLUMN IF NOT EXISTS onway_problem_summary text;

CREATE TABLE public.onway_comment_ai_cache (
  comment_hash text PRIMARY KEY,
  reason text NOT NULL,
  confidence real NOT NULL,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.onway_comment_ai_cache TO service_role;
ALTER TABLE public.onway_comment_ai_cache ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sms_sequence_on_order_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF NEW.status IN ('canceled','cancelled','returned') AND OLD.status IS DISTINCT FROM NEW.status THEN
      UPDATE sms_queue SET status = 'skipped', last_error = 'order_' || NEW.status WHERE order_id = NEW.id AND status = 'pending';
    ELSIF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
      -- Auto-confirmed orders get the combined first text from send-sms instead.
      IF NOT coalesce(NEW.auto_confirmed, false) THEN
        PERFORM sms_enqueue(NEW.id, 'order_confirmed', 1, now() + interval '5 minutes');
      END IF;
    ELSIF NEW.call_outcome = 'no_answer' AND NEW.status NOT IN ('confirmed','canceled','cancelled')
      AND (OLD.call_outcome IS DISTINCT FROM 'no_answer' OR NEW.call_attempt_count IS DISTINCT FROM OLD.call_attempt_count) THEN
      PERFORM sms_enqueue(NEW.id, 'call_no_answer', 2, now());
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'sms sequence enqueue failed: %', SQLERRM;
  END;
  RETURN NEW;
END $$;