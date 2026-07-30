ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_return boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_reason text;

CREATE INDEX IF NOT EXISTS idx_orders_is_return ON public.orders (is_return) WHERE is_return = true;
CREATE INDEX IF NOT EXISTS idx_orders_return_review ON public.orders (status) WHERE status = 'return_review';
CREATE INDEX IF NOT EXISTS idx_orders_original_order_id ON public.orders (original_order_id);