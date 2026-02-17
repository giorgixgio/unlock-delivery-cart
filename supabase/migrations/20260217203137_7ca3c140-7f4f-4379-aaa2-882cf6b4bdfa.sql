
-- 1) batches table
CREATE TABLE public.batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by text,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','LOCKED','RELEASED')),
  packing_list_printed_at timestamp with time zone,
  packing_list_printed_by text,
  packing_list_print_count integer NOT NULL DEFAULT 0,
  packing_slips_printed_at timestamp with time zone,
  packing_slips_printed_by text,
  packing_slips_print_count integer NOT NULL DEFAULT 0,
  released_at timestamp with time zone,
  released_by text
);

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage batches" ON public.batches FOR ALL
  USING (is_active_admin(auth.uid()));

-- 2) batch_orders table
CREATE TABLE public.batch_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  UNIQUE(batch_id, order_id)
);

ALTER TABLE public.batch_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage batch_orders" ON public.batch_orders FOR ALL
  USING (is_active_admin(auth.uid()));

-- 3) batch_order_items_snapshot
CREATE TABLE public.batch_order_items_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  sku text NOT NULL,
  product_name text NOT NULL DEFAULT '',
  qty integer NOT NULL DEFAULT 1
);

ALTER TABLE public.batch_order_items_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage batch_order_items_snapshot" ON public.batch_order_items_snapshot FOR ALL
  USING (is_active_admin(auth.uid()));

-- 4) batch_events
CREATE TABLE public.batch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.batch_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage batch_events" ON public.batch_events FOR ALL
  USING (is_active_admin(auth.uid()));

-- 5) batch_print_jobs
CREATE TABLE public.batch_print_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by text,
  print_type text NOT NULL,
  print_count integer NOT NULL DEFAULT 1
);

ALTER TABLE public.batch_print_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage batch_print_jobs" ON public.batch_print_jobs FOR ALL
  USING (is_active_admin(auth.uid()));

-- 6) Add columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS released_at timestamp with time zone;
