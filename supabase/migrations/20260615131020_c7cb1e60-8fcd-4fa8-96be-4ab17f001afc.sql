
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS call_attempt_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_call_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_call_attempt_by text,
  ADD COLUMN IF NOT EXISTS next_call_after timestamptz,
  ADD COLUMN IF NOT EXISTS call_attempt_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS final_cancel_reason text,
  ADD COLUMN IF NOT EXISTS final_cancel_note text,
  ADD COLUMN IF NOT EXISTS canceled_after_attempts boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_retry_queue
  ON public.orders (status, call_attempt_count)
  WHERE status NOT IN ('confirmed','canceled','fulfilled','merged');

CREATE INDEX IF NOT EXISTS idx_orders_next_call_after
  ON public.orders (next_call_after)
  WHERE next_call_after IS NOT NULL;
