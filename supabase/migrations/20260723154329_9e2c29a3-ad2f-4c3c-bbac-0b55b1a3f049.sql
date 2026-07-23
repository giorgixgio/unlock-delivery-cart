
CREATE TABLE public.sms_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL,
  phone TEXT,
  type TEXT NOT NULL CHECK (type IN ('confirmation','fulfillment')),
  sender TEXT NOT NULL DEFAULT 'BIGMART',
  content TEXT,
  error_code INTEGER,
  api_message TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sms_logs_order_type_uniq
  ON public.sms_logs (order_number, type);

CREATE INDEX sms_logs_created_at_idx ON public.sms_logs (created_at DESC);

GRANT SELECT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sms_logs"
  ON public.sms_logs
  FOR SELECT
  TO authenticated
  USING (public.is_active_admin(auth.uid()));
