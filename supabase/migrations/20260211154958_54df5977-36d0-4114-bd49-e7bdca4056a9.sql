
-- Product stats for future ranking (populated later via sync or edge function)
CREATE TABLE public.product_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id text NOT NULL UNIQUE,
  view_count integer NOT NULL DEFAULT 0,
  add_to_cart_count integer NOT NULL DEFAULT 0,
  purchase_count integer NOT NULL DEFAULT 0,
  score numeric NOT NULL DEFAULT 0,
  last_30d_score numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.product_stats ENABLE ROW LEVEL SECURITY;

-- Anyone can read stats (public data for ranking)
CREATE POLICY "Anyone can read product_stats"
  ON public.product_stats FOR SELECT
  USING (true);

-- Only admins can modify stats
CREATE POLICY "Admins can manage product_stats"
  ON public.product_stats FOR ALL
  USING (is_active_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_product_stats_updated_at
  BEFORE UPDATE ON public.product_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Grid events for tracking user interactions
CREATE TABLE public.grid_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  product_id text,
  grid_position integer,
  grid_section text,
  hero_product_id text,
  scroll_depth integer,
  session_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.grid_events ENABLE ROW LEVEL SECURITY;

-- Anyone can insert events (anonymous tracking)
CREATE POLICY "Anyone can insert grid_events"
  ON public.grid_events FOR INSERT
  WITH CHECK (true);

-- Only admins can read events
CREATE POLICY "Admins can read grid_events"
  ON public.grid_events FOR SELECT
  USING (is_active_admin(auth.uid()));
