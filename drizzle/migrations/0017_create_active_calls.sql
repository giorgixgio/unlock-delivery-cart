CREATE TABLE public.active_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES public.orders(id),
  phone TEXT NOT NULL,
  customer_name TEXT,
  source_device TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.active_calls TO authenticated;
GRANT ALL ON public.active_calls TO service_role;

ALTER TABLE public.active_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators read own active calls"
  ON public.active_calls FOR SELECT TO authenticated
  USING (operator_id = auth.uid());

CREATE POLICY "Operators insert own active calls"
  ON public.active_calls FOR INSERT TO authenticated
  WITH CHECK (operator_id = auth.uid());

CREATE INDEX idx_active_calls_operator_created ON public.active_calls (operator_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.active_calls;