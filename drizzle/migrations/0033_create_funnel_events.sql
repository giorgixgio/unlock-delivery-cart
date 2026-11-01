CREATE TABLE public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text,
  event_type text NOT NULL,
  product_slug text,
  page_path text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.funnel_events TO anon, authenticated;
GRANT ALL ON public.funnel_events TO service_role;
ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX funnel_events_created_type_idx ON public.funnel_events (created_at, event_type);
CREATE POLICY "Anon can insert funnel_events" ON public.funnel_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    event_type IN ('landing_view','form_open','phone_entered','address_entered','order_submitted')
    AND (session_id IS NULL OR length(session_id) <= 64)
    AND (product_slug IS NULL OR length(product_slug) <= 200)
    AND (page_path IS NULL OR length(page_path) <= 500)
    AND pg_column_size(metadata) <= 2000
  );