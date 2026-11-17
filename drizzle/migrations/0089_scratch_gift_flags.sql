ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS is_gift boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo text;
COMMENT ON COLUMN public.order_items.is_gift IS 'Free promo unit (unit_price 0); counts for packing/stock/labels, never revenue.';
COMMENT ON COLUMN public.orders.promo IS 'Landing promo applied to the order, e.g. scratch_0012_4.';