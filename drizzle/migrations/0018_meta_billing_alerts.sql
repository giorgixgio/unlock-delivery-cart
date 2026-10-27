CREATE TABLE public.meta_billing_alerts (
  ad_account_id text PRIMARY KEY,
  threshold_usd numeric NOT NULL,
  phone text,
  last_milestone numeric,
  last_balance_usd numeric,
  last_checked_at timestamptz,
  last_error text
);
GRANT ALL ON public.meta_billing_alerts TO service_role;
ALTER TABLE public.meta_billing_alerts ENABLE ROW LEVEL SECURITY;