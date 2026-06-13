ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS call_outcome text NULL,
  ADD COLUMN IF NOT EXISTS call_outcome_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS call_outcome_updated_by text NULL;

CREATE INDEX IF NOT EXISTS orders_call_outcome_idx ON public.orders(call_outcome);