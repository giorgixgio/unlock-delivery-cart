ALTER TABLE public.wholesale_batches
  ADD COLUMN IF NOT EXISTS is_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipping_stage text;

ALTER TABLE public.wholesale_batches
  DROP CONSTRAINT IF EXISTS wholesale_batches_shipping_stage_check;
ALTER TABLE public.wholesale_batches
  ADD CONSTRAINT wholesale_batches_shipping_stage_check
  CHECK (shipping_stage IS NULL OR shipping_stage = ANY (ARRAY['in_transit','arrived','cleared_customs']));

ALTER TABLE public.wholesale_items
  DROP CONSTRAINT IF EXISTS wholesale_items_logistics_stage_check;
ALTER TABLE public.wholesale_items
  ADD CONSTRAINT wholesale_items_logistics_stage_check
  CHECK (logistics_stage = ANY (ARRAY['to_be_ordered','ordered','at_freight_forwarder','in_transit','arrived','cleared_customs']));

ALTER TABLE public.wholesale_items ALTER COLUMN logistics_stage SET DEFAULT 'to_be_ordered';
ALTER TABLE public.wholesale_items ALTER COLUMN batch_id DROP NOT NULL;