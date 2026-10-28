CREATE TABLE public.onway_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  method text NOT NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  body_raw text,
  body_json jsonb,
  source_ip text
);
GRANT ALL ON public.onway_webhook_log TO service_role;
REVOKE ALL ON public.onway_webhook_log FROM anon, authenticated;
ALTER TABLE public.onway_webhook_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX onway_webhook_log_received_at_idx ON public.onway_webhook_log (received_at DESC);
COMMENT ON TABLE public.onway_webhook_log IS 'Onway callback capture only; service-role access, no order mutations. Authentication tokens and sensitive headers are redacted.';