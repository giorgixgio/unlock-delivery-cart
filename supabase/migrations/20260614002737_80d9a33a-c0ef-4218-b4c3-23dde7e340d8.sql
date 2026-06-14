
-- Sequence for human-friendly wave numbers
CREATE SEQUENCE IF NOT EXISTS public.packing_wave_number_seq START 1;

-- packing_waves
CREATE TABLE public.packing_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_number bigint NOT NULL DEFAULT nextval('public.packing_wave_number_seq'),
  name text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  exported_at timestamptz,
  exported_by text,
  exported_order_count integer NOT NULL DEFAULT 0,
  export_filename text,
  tracking_imported_at timestamptz,
  tracking_imported_by text,
  stickers_printed_at timestamptz,
  stickers_printed_by text,
  completed_at timestamptz,
  completed_by text,
  notes text,
  UNIQUE (wave_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_waves TO authenticated;
GRANT ALL ON public.packing_waves TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.packing_wave_number_seq TO authenticated, service_role;
ALTER TABLE public.packing_waves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active admins manage packing_waves" ON public.packing_waves FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid())) WITH CHECK (public.is_active_admin(auth.uid()));

-- packing_wave_orders
CREATE TABLE public.packing_wave_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id uuid NOT NULL REFERENCES public.packing_waves(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  classification text NOT NULL,
  primary_sku text,
  sku_count integer NOT NULL DEFAULT 1,
  total_qty integer NOT NULL DEFAULT 1,
  packing_status text NOT NULL DEFAULT 'not_packed',
  packed_at timestamptz,
  packed_by text,
  issue_type text,
  issue_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);
CREATE INDEX idx_packing_wave_orders_wave ON public.packing_wave_orders(wave_id);
CREATE INDEX idx_packing_wave_orders_classification ON public.packing_wave_orders(wave_id, classification);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_wave_orders TO authenticated;
GRANT ALL ON public.packing_wave_orders TO service_role;
ALTER TABLE public.packing_wave_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active admins manage packing_wave_orders" ON public.packing_wave_orders FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid())) WITH CHECK (public.is_active_admin(auth.uid()));

-- packing_runs
CREATE TABLE public.packing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id uuid NOT NULL REFERENCES public.packing_waves(id) ON DELETE CASCADE,
  run_number integer NOT NULL,
  slot_count integer NOT NULL,
  status text NOT NULL DEFAULT 'created',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  completed_at timestamptz,
  completed_by text,
  UNIQUE (wave_id, run_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_runs TO authenticated;
GRANT ALL ON public.packing_runs TO service_role;
ALTER TABLE public.packing_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active admins manage packing_runs" ON public.packing_runs FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid())) WITH CHECK (public.is_active_admin(auth.uid()));

-- packing_run_slots
CREATE TABLE public.packing_run_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.packing_runs(id) ON DELETE CASCADE,
  wave_id uuid NOT NULL REFERENCES public.packing_waves(id) ON DELETE CASCADE,
  slot_number integer NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tracking_number_snapshot text,
  packing_status text NOT NULL DEFAULT 'not_packed',
  packed_at timestamptz,
  packed_by text,
  issue_type text,
  issue_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, slot_number),
  UNIQUE (run_id, order_id)
);
CREATE INDEX idx_run_slots_wave ON public.packing_run_slots(wave_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.packing_run_slots TO authenticated;
GRANT ALL ON public.packing_run_slots TO service_role;
ALTER TABLE public.packing_run_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active admins manage packing_run_slots" ON public.packing_run_slots FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid())) WITH CHECK (public.is_active_admin(auth.uid()));

-- Add columns to orders (additive only)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS packing_wave_id uuid REFERENCES public.packing_waves(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS packing_status text NOT NULL DEFAULT 'not_packed',
  ADD COLUMN IF NOT EXISTS packed_at timestamptz,
  ADD COLUMN IF NOT EXISTS packed_by text;
CREATE INDEX IF NOT EXISTS idx_orders_packing_wave_id ON public.orders(packing_wave_id) WHERE packing_wave_id IS NOT NULL;

-- updated_at trigger for waves
CREATE TRIGGER trg_packing_waves_updated_at BEFORE UPDATE ON public.packing_waves
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC: create_packing_wave
CREATE OR REPLACE FUNCTION public.create_packing_wave(actor text)
RETURNS TABLE(wave_id uuid, wave_number bigint, total integer, single_sku integer, multi_sku integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wave_id uuid;
  v_wave_number bigint;
  v_total integer := 0;
  v_single integer := 0;
  v_multi integer := 0;
BEGIN
  INSERT INTO public.packing_waves (created_by, status)
  VALUES (actor, 'draft')
  RETURNING id, packing_waves.wave_number INTO v_wave_id, v_wave_number;

  WITH eligible AS (
    SELECT o.id AS order_id,
           o.created_at,
           COUNT(DISTINCT oi.sku) AS sku_count,
           COALESCE(SUM(oi.quantity), 0)::int AS total_qty,
           (ARRAY_AGG(oi.sku ORDER BY oi.sku))[1] AS primary_sku
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.is_confirmed = true
      AND o.is_fulfilled = false
      AND o.status = 'confirmed'
      AND o.packing_wave_id IS NULL
      AND COALESCE(o.customer_phone, '') <> ''
    GROUP BY o.id, o.created_at
    HAVING COUNT(oi.id) > 0
  ),
  inserted AS (
    INSERT INTO public.packing_wave_orders
      (wave_id, order_id, classification, primary_sku, sku_count, total_qty)
    SELECT v_wave_id,
           order_id,
           CASE WHEN sku_count > 1 THEN 'multi_sku' ELSE 'single_sku' END,
           primary_sku,
           sku_count::int,
           total_qty,
           NULL  -- placeholder, ignored
    FROM (SELECT order_id, sku_count, total_qty, primary_sku FROM eligible) e
    ON CONFLICT (order_id) DO NOTHING
    RETURNING order_id, classification
  )
  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE classification = 'single_sku')::int,
         COUNT(*) FILTER (WHERE classification = 'multi_sku')::int
  INTO v_total, v_single, v_multi
  FROM inserted;

  -- Stamp orders with the wave id
  UPDATE public.orders o
  SET packing_wave_id = v_wave_id
  FROM public.packing_wave_orders pwo
  WHERE pwo.wave_id = v_wave_id AND pwo.order_id = o.id;

  wave_id := v_wave_id;
  wave_number := v_wave_number;
  total := v_total;
  single_sku := v_single;
  multi_sku := v_multi;
  RETURN NEXT;
END;
$$;

-- Fix: the SELECT inside INSERT had a stray NULL column. Recreate cleanly.
CREATE OR REPLACE FUNCTION public.create_packing_wave(actor text)
RETURNS TABLE(wave_id uuid, wave_number bigint, total integer, single_sku integer, multi_sku integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wave_id uuid;
  v_wave_number bigint;
  v_total integer := 0;
  v_single integer := 0;
  v_multi integer := 0;
BEGIN
  INSERT INTO public.packing_waves (created_by, status)
  VALUES (actor, 'draft')
  RETURNING id, packing_waves.wave_number INTO v_wave_id, v_wave_number;

  WITH eligible AS (
    SELECT o.id AS order_id,
           COUNT(DISTINCT oi.sku) AS sku_count,
           COALESCE(SUM(oi.quantity), 0)::int AS total_qty,
           (ARRAY_AGG(oi.sku ORDER BY oi.sku))[1] AS primary_sku
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.is_confirmed = true
      AND o.is_fulfilled = false
      AND o.status = 'confirmed'
      AND o.packing_wave_id IS NULL
      AND COALESCE(o.customer_phone, '') <> ''
    GROUP BY o.id
  ),
  inserted AS (
    INSERT INTO public.packing_wave_orders
      (wave_id, order_id, classification, primary_sku, sku_count, total_qty)
    SELECT v_wave_id,
           e.order_id,
           CASE WHEN e.sku_count > 1 THEN 'multi_sku' ELSE 'single_sku' END,
           e.primary_sku,
           e.sku_count::int,
           e.total_qty
    FROM eligible e
    ON CONFLICT (order_id) DO NOTHING
    RETURNING order_id, classification
  )
  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE classification = 'single_sku')::int,
         COUNT(*) FILTER (WHERE classification = 'multi_sku')::int
  INTO v_total, v_single, v_multi
  FROM inserted;

  UPDATE public.orders o
  SET packing_wave_id = v_wave_id
  FROM public.packing_wave_orders pwo
  WHERE pwo.wave_id = v_wave_id AND pwo.order_id = o.id;

  wave_id := v_wave_id;
  wave_number := v_wave_number;
  total := v_total;
  single_sku := v_single;
  multi_sku := v_multi;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_packing_wave(text) TO authenticated, service_role;

-- RPC: assign_packing_run_slots
CREATE OR REPLACE FUNCTION public.assign_packing_run_slots(p_wave_id uuid, p_slot_count integer, actor text)
RETURNS TABLE(run_id uuid, run_number integer, assigned integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid;
  v_run_number integer;
  v_assigned integer := 0;
BEGIN
  IF p_slot_count IS NULL OR p_slot_count < 1 THEN
    RAISE EXCEPTION 'slot_count must be >= 1';
  END IF;

  SELECT COALESCE(MAX(run_number), 0) + 1 INTO v_run_number
  FROM public.packing_runs WHERE wave_id = p_wave_id;

  INSERT INTO public.packing_runs (wave_id, run_number, slot_count, created_by)
  VALUES (p_wave_id, v_run_number, p_slot_count, actor)
  RETURNING id INTO v_run_id;

  WITH candidates AS (
    SELECT pwo.order_id, o.tracking_number, o.created_at
    FROM public.packing_wave_orders pwo
    JOIN public.orders o ON o.id = pwo.order_id
    LEFT JOIN public.packing_run_slots prs ON prs.order_id = pwo.order_id AND prs.wave_id = p_wave_id
    WHERE pwo.wave_id = p_wave_id
      AND pwo.classification = 'multi_sku'
      AND pwo.packing_status IN ('not_packed', 'packing')
      AND prs.id IS NULL
    ORDER BY o.created_at ASC, o.id ASC
    LIMIT p_slot_count
  ),
  numbered AS (
    SELECT order_id, tracking_number, ROW_NUMBER() OVER (ORDER BY created_at ASC, order_id ASC) AS slot_number
    FROM candidates
  ),
  ins AS (
    INSERT INTO public.packing_run_slots (run_id, wave_id, slot_number, order_id, tracking_number_snapshot)
    SELECT v_run_id, p_wave_id, n.slot_number::int, n.order_id, n.tracking_number
    FROM numbered n
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_assigned FROM ins;

  run_id := v_run_id;
  run_number := v_run_number;
  assigned := v_assigned;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_packing_run_slots(uuid, integer, text) TO authenticated, service_role;

-- RPC: complete_packing_wave
CREATE OR REPLACE FUNCTION public.complete_packing_wave(p_wave_id uuid, p_force boolean, actor text)
RETURNS TABLE(completed boolean, unpacked integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unpacked integer;
BEGIN
  SELECT COUNT(*)::int INTO v_unpacked
  FROM public.packing_wave_orders
  WHERE wave_id = p_wave_id AND packing_status <> 'packed';

  IF v_unpacked > 0 AND NOT p_force THEN
    completed := false;
    unpacked := v_unpacked;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.packing_waves
  SET status = 'completed', completed_at = now(), completed_by = actor
  WHERE id = p_wave_id;

  completed := true;
  unpacked := v_unpacked;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_packing_wave(uuid, boolean, text) TO authenticated, service_role;
