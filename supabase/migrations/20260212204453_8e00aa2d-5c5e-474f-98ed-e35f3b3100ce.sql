
-- Idempotency keys table
CREATE TABLE public.idempotency_keys (
  idempotency_key UUID NOT NULL PRIMARY KEY,
  action_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage idempotency_keys"
  ON public.idempotency_keys FOR ALL
  USING (is_active_admin(auth.uid()));

CREATE POLICY "Anyone can insert idempotency_keys"
  ON public.idempotency_keys FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can read idempotency_keys"
  ON public.idempotency_keys FOR SELECT
  USING (true);

-- Add version column to orders
ALTER TABLE public.orders ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

-- Index for fast idempotency lookups
CREATE INDEX idx_idempotency_keys_action_entity ON public.idempotency_keys (action_type, entity_id);
