ALTER TABLE public.product_scan_history
  ADD COLUMN IF NOT EXISTS primary_reasoning text,
  ADD COLUMN IF NOT EXISTS primary_features_compared text;