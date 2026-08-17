ALTER TABLE public.courier_import_batches ADD COLUMN IF NOT EXISTS order_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_import_batch_id uuid REFERENCES public.courier_import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_courier_import_batch ON public.orders(courier_import_batch_id);