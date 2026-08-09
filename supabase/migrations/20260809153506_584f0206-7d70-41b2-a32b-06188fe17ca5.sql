ALTER TABLE public.product_landing_config
  ADD COLUMN IF NOT EXISTS offer_1plus1_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_timer_minutes integer NOT NULL DEFAULT 59;