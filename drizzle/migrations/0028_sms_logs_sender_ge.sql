ALTER TABLE public.sms_logs
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'sender.ge',
  ADD COLUMN IF NOT EXISTS message_id text,
  ADD COLUMN IF NOT EXISTS segments integer,
  ADD COLUMN IF NOT EXISTS delivery_status text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
UPDATE public.sms_logs SET provider = 'smsoffice' WHERE message_id IS NULL;
ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_delivery_status_check
  CHECK (delivery_status IS NULL OR delivery_status IN ('pending','delivered','undelivered'));
ALTER TABLE public.sms_logs DROP CONSTRAINT IF EXISTS sms_logs_type_check;
ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_type_check
  CHECK (type IN ('confirmation','fulfillment','review_request'));
CREATE INDEX IF NOT EXISTS sms_logs_message_id_idx ON public.sms_logs (message_id);
CREATE INDEX IF NOT EXISTS sms_logs_delivery_pending_idx ON public.sms_logs (delivery_status) WHERE delivery_status = 'pending';
DROP TRIGGER IF EXISTS sms_logs_updated_at ON public.sms_logs;
CREATE TRIGGER sms_logs_updated_at BEFORE UPDATE ON public.sms_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE FUNCTION public.sms_claim_retry(p_order_number text, p_type text, p_phone text, p_content text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.sms_logs
     SET status = 'pending', attempts = coalesce(attempts, 1) + 1, phone = p_phone, content = p_content,
         provider = 'sender.ge', sender = 'sender.ge', error_code = NULL, api_message = NULL,
         message_id = NULL, segments = NULL, delivery_status = NULL, delivered_at = NULL
   WHERE order_number = p_order_number AND type = p_type
     AND (status = 'failed' OR (status = 'pending' AND updated_at < now() - interval '2 minutes'))
  RETURNING id;
$$;
REVOKE ALL ON FUNCTION public.sms_claim_retry(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_claim_retry(text, text, text, text) TO service_role;