ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS onway_tracking text,
  ADD COLUMN IF NOT EXISTS onway_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS onway_api_status text;

CREATE TABLE public.onway_api_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid,
  endpoint text NOT NULL,
  request_masked jsonb NOT NULL DEFAULT '{}'::jsonb,
  http_status integer,
  response_raw text,
  parsed_tracking text,
  error_message text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.onway_api_log TO service_role;
ALTER TABLE public.onway_api_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX onway_api_log_order_idx ON public.onway_api_log(order_id, created_at DESC);