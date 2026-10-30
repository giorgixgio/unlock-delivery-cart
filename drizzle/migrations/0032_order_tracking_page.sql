CREATE OR REPLACE FUNCTION public.gen_tracking_token() RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE chars constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'; t text; b bytea;
BEGIN
  LOOP
    b := extensions.gen_random_bytes(6); t := '';
    FOR i IN 0..5 LOOP t := t || substr(chars, (get_byte(b, i) % 62) + 1, 1); END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM orders WHERE tracking_token = t);
  END LOOP;
  RETURN t;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_token text,
  ADD COLUMN IF NOT EXISTS tracking_view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tracking_first_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS tracking_last_seen_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_uniq ON public.orders (tracking_token) WHERE tracking_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.orders_set_tracking_token() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tracking_token IS NULL THEN NEW.tracking_token := public.gen_tracking_token(); END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER orders_tracking_token BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_set_tracking_token();

UPDATE public.orders SET tracking_token = public.gen_tracking_token()
WHERE tracking_token IS NULL AND created_at > now() - interval '14 days'
  AND status NOT IN ('delivered','canceled','cancelled','returned','merged','archived');

-- Customer requests from the tracking page = operator tasks.
CREATE TABLE public.customer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('change_address','change_day','call_me','cancel_save','self_canceled')),
  priority boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);
CREATE INDEX customer_requests_open_idx ON public.customer_requests (created_at DESC) WHERE status = 'open';
CREATE INDEX customer_requests_order_idx ON public.customer_requests (order_id);
GRANT SELECT, UPDATE ON public.customer_requests TO authenticated;
GRANT ALL ON public.customer_requests TO service_role;
ALTER TABLE public.customer_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read customer requests" ON public.customer_requests FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff resolve customer requests" ON public.customer_requests FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid())) WITH CHECK (public.is_active_staff(auth.uid()));

CREATE TABLE public.customer_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'operator_call' CHECK (kind IN ('operator_call')),
  operator text,
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind)
);
CREATE INDEX customer_feedback_created_idx ON public.customer_feedback (created_at DESC);
GRANT SELECT ON public.customer_feedback TO authenticated;
GRANT ALL ON public.customer_feedback TO service_role;
ALTER TABLE public.customer_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read customer feedback" ON public.customer_feedback FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE TABLE public.tracking_rate_hits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracking_rate_hits_ip_idx ON public.tracking_rate_hits (ip, created_at DESC);
GRANT ALL ON public.tracking_rate_hits TO service_role;
ALTER TABLE public.tracking_rate_hits ENABLE ROW LEVEL SECURITY;

-- Shared cancel-stock core so the customer self-cancel uses the same logic as operators.
CREATE OR REPLACE FUNCTION public.apply_order_cancel_stock_core(p_order_id uuid, p_restore boolean, p_actor uuid, p_actor_email text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_number text; v_affected integer := 0; r record; v_prev integer; v_new integer;
BEGIN
  SELECT public_order_number INTO v_number FROM public.orders WHERE id = p_order_id;
  IF v_number IS NULL THEN RETURN 0; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stock_activity_log WHERE order_id = p_order_id AND change_type = 'order_confirm') THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.stock_activity_log WHERE order_id = p_order_id AND change_type = 'order_cancel_restore') THEN RETURN 0; END IF;
  FOR r IN
    SELECT l.product_id, SUM(-l.delta)::int AS qty FROM public.stock_activity_log l
    WHERE l.order_id = p_order_id AND l.change_type = 'order_confirm' AND l.product_id IS NOT NULL GROUP BY l.product_id
  LOOP
    IF p_restore THEN
      SELECT COALESCE(stock_quantity, 0) INTO v_prev FROM public.products WHERE id = r.product_id FOR UPDATE;
      v_new := v_prev + r.qty;
      UPDATE public.products SET stock_quantity = v_new WHERE id = r.product_id;
      INSERT INTO public.stock_activity_log (product_id, changed_by, changed_by_email, change_type, delta, previous_value, new_value, comment, order_id)
      VALUES (r.product_id, p_actor, p_actor_email, 'order_cancel_restore', r.qty, v_prev, v_new, 'Order #' || v_number || ' cancelled — stock restored', p_order_id);
    ELSE
      SELECT COALESCE(stock_quantity, 0) INTO v_prev FROM public.products WHERE id = r.product_id;
      INSERT INTO public.stock_activity_log (product_id, changed_by, changed_by_email, change_type, delta, previous_value, new_value, comment, order_id)
      VALUES (r.product_id, p_actor, p_actor_email, 'order_cancel_restore', 0, v_prev, v_prev, 'Order #' || v_number || ' cancelled — stock not restored (operator choice)', p_order_id);
    END IF;
    v_affected := v_affected + 1;
  END LOOP;
  RETURN v_affected;
END $function$;
REVOKE ALL ON FUNCTION public.apply_order_cancel_stock_core(uuid, boolean, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_cancel_stock_core(uuid, boolean, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_order_cancel_stock(p_order_id uuid, p_restore boolean DEFAULT true)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_email text;
BEGIN
  IF NOT public.is_active_staff(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  RETURN public.apply_order_cancel_stock_core(p_order_id, p_restore, auth.uid(), v_email);
END $function$;