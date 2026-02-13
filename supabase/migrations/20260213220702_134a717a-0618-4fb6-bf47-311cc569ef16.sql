
-- Single source of truth for stock overrides (admin sets product in/out of stock)
CREATE TABLE public.product_stock_overrides (
  product_id TEXT NOT NULL PRIMARY KEY,
  available BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by TEXT DEFAULT 'admin'
);

-- Enable RLS
ALTER TABLE public.product_stock_overrides ENABLE ROW LEVEL SECURITY;

-- Anyone can read (storefront needs this)
CREATE POLICY "Anyone can read stock overrides"
  ON public.product_stock_overrides FOR SELECT
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage stock overrides"
  ON public.product_stock_overrides FOR ALL
  USING (is_active_admin(auth.uid()));

-- Enable realtime so storefront gets instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_stock_overrides;
