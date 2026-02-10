
-- Add merge tracking and auto-confirm fields
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS merged_into_order_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS merged_child_order_ids uuid[] DEFAULT '{}';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS auto_confirmed boolean DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS auto_confirm_reason text;

-- Index for merge lookups
CREATE INDEX IF NOT EXISTS idx_orders_merged_into ON public.orders(merged_into_order_id) WHERE merged_into_order_id IS NOT NULL;
