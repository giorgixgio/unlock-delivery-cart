ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.stock_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text REFERENCES public.products(id) ON DELETE SET NULL,
  changed_by uuid,
  changed_by_email text,
  change_type text NOT NULL CHECK (change_type IN ('manual_set','manual_adjust','order_confirm','order_cancel_restore')),
  delta integer NOT NULL DEFAULT 0,
  previous_value integer,
  new_value integer,
  comment text,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_activity_log_product ON public.stock_activity_log(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_activity_log_order ON public.stock_activity_log(order_id);

GRANT SELECT ON public.stock_activity_log TO authenticated;
GRANT ALL ON public.stock_activity_log TO service_role;

ALTER TABLE public.stock_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read stock activity" ON public.stock_activity_log;
CREATE POLICY "Staff can read stock activity"
  ON public.stock_activity_log FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id text,
  p_mode text,
  p_value integer,
  p_comment text DEFAULT NULL
)
RETURNS TABLE(previous_value integer, new_value integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prev integer;
  v_new integer;
  v_email text;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_mode NOT IN ('set','adjust') THEN RAISE EXCEPTION 'invalid mode'; END IF;
  IF p_value IS NULL THEN RAISE EXCEPTION 'value required'; END IF;

  SELECT COALESCE(stock_quantity, 0) INTO v_prev FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'product not found'; END IF;

  IF p_mode = 'set' THEN
    v_new := GREATEST(p_value, 0);
  ELSE
    v_new := GREATEST(v_prev + p_value, 0);
  END IF;

  UPDATE public.products SET stock_quantity = v_new WHERE id = p_product_id;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.stock_activity_log
    (product_id, changed_by, changed_by_email, change_type, delta, previous_value, new_value, comment)
  VALUES
    (p_product_id, auth.uid(), v_email,
     CASE WHEN p_mode = 'set' THEN 'manual_set' ELSE 'manual_adjust' END,
     v_new - v_prev, v_prev, v_new, NULLIF(btrim(COALESCE(p_comment, '')), ''));

  previous_value := v_prev;
  new_value := v_new;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_order_confirm_stock(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_number text;
  v_affected integer := 0;
  r record;
  v_prev integer;
  v_new integer;
BEGIN
  IF NOT public.is_active_staff(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT public_order_number INTO v_number FROM public.orders WHERE id = p_order_id;
  IF v_number IS NULL THEN RETURN 0; END IF;

  -- Only ever decrement once per order
  IF EXISTS (SELECT 1 FROM public.stock_activity_log
             WHERE order_id = p_order_id AND change_type = 'order_confirm') THEN
    RETURN 0;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  FOR r IN
    SELECT oi.product_id, SUM(oi.quantity)::int AS qty
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
    GROUP BY oi.product_id
  LOOP
    SELECT COALESCE(stock_quantity, 0) INTO v_prev FROM public.products WHERE id = r.product_id FOR UPDATE;
    v_new := v_prev - r.qty;
    UPDATE public.products SET stock_quantity = v_new WHERE id = r.product_id;
    INSERT INTO public.stock_activity_log
      (product_id, changed_by, changed_by_email, change_type, delta, previous_value, new_value, comment, order_id)
    VALUES
      (r.product_id, auth.uid(), v_email, 'order_confirm', -r.qty, v_prev, v_new,
       'Order #' || v_number || ' confirmed', p_order_id);
    v_affected := v_affected + 1;
  END LOOP;

  RETURN v_affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_order_cancel_stock(p_order_id uuid, p_restore boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_number text;
  v_affected integer := 0;
  r record;
  v_prev integer;
  v_new integer;
BEGIN
  IF NOT public.is_active_staff(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT public_order_number INTO v_number FROM public.orders WHERE id = p_order_id;
  IF v_number IS NULL THEN RETURN 0; END IF;

  -- Nothing to do when stock was never decremented, or already handled
  IF NOT EXISTS (SELECT 1 FROM public.stock_activity_log
                 WHERE order_id = p_order_id AND change_type = 'order_confirm') THEN
    RETURN 0;
  END IF;
  IF EXISTS (SELECT 1 FROM public.stock_activity_log
             WHERE order_id = p_order_id AND change_type = 'order_cancel_restore') THEN
    RETURN 0;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  FOR r IN
    SELECT l.product_id, SUM(-l.delta)::int AS qty
    FROM public.stock_activity_log l
    WHERE l.order_id = p_order_id AND l.change_type = 'order_confirm' AND l.product_id IS NOT NULL
    GROUP BY l.product_id
  LOOP
    IF p_restore THEN
      SELECT COALESCE(stock_quantity, 0) INTO v_prev FROM public.products WHERE id = r.product_id FOR UPDATE;
      v_new := v_prev + r.qty;
      UPDATE public.products SET stock_quantity = v_new WHERE id = r.product_id;
      INSERT INTO public.stock_activity_log
        (product_id, changed_by, changed_by_email, change_type, delta, previous_value, new_value, comment, order_id)
      VALUES
        (r.product_id, auth.uid(), v_email, 'order_cancel_restore', r.qty, v_prev, v_new,
         'Order #' || v_number || ' cancelled — stock restored', p_order_id);
    ELSE
      SELECT COALESCE(stock_quantity, 0) INTO v_prev FROM public.products WHERE id = r.product_id;
      INSERT INTO public.stock_activity_log
        (product_id, changed_by, changed_by_email, change_type, delta, previous_value, new_value, comment, order_id)
      VALUES
        (r.product_id, auth.uid(), v_email, 'order_cancel_restore', 0, v_prev, v_prev,
         'Order #' || v_number || ' cancelled — stock not restored (operator choice)', p_order_id);
    END IF;
    v_affected := v_affected + 1;
  END LOOP;

  RETURN v_affected;
END;
$$;