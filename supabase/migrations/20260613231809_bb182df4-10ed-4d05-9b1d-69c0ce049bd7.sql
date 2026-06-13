ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS operator_viewed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS operator_viewed_by text NULL,
  ADD COLUMN IF NOT EXISTS operator_review_status text NULL;

CREATE INDEX IF NOT EXISTS idx_orders_operator_viewed_at
  ON public.orders (operator_viewed_at);