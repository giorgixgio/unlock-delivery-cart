CREATE OR REPLACE FUNCTION public.deduct_order_stock_once(p_order_id uuid, p_actor uuid DEFAULT NULL, p_actor_email text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_number text;
  v_affected integer := 0;
  r record;
  v_prev integer;
  v_new integer;
BEGIN
  SELECT public_order_number INTO v_number
  FROM public.orders
  WHERE id = p_order_id;

  IF v_number IS NULL THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_activity_log
    WHERE order_id = p_order_id AND change_type = 'order_confirm'
  ) THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT oi.product_id, SUM(oi.quantity)::integer AS qty
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
    GROUP BY oi.product_id
  LOOP
    SELECT COALESCE(stock_quantity, 0)
    INTO v_prev
    FROM public.products
    WHERE id = r.product_id
    FOR UPDATE;

    v_new := GREATEST(v_prev - r.qty, 0);

    UPDATE public.products
    SET stock_quantity = v_new
    WHERE id = r.product_id;

    INSERT INTO public.stock_activity_log
      (product_id, changed_by, changed_by_email, change_type, delta, previous_value, new_value, comment, order_id)
    VALUES
      (r.product_id, p_actor, p_actor_email, 'order_confirm', v_new - v_prev, v_prev, v_new,
       'Order #' || v_number || ' stock deducted', p_order_id);

    v_affected := v_affected + 1;
  END LOOP;

  RETURN v_affected;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.deduct_order_stock_once(uuid, uuid, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.deduct_order_stock_once(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_order_confirm_stock(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
BEGIN
  IF NOT public.is_active_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  RETURN public.deduct_order_stock_once(p_order_id, auth.uid(), v_email);
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_stock_when_fulfilled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
BEGIN
  IF NEW.is_fulfilled = true AND COALESCE(OLD.is_fulfilled, false) = false THEN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
    PERFORM public.deduct_order_stock_once(NEW.id, auth.uid(), v_email);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_deduct_stock_on_fulfillment ON public.orders;
CREATE TRIGGER orders_deduct_stock_on_fulfillment
AFTER UPDATE OF is_fulfilled ON public.orders
FOR EACH ROW
WHEN (NEW.is_fulfilled = true AND OLD.is_fulfilled = false)
EXECUTE FUNCTION public.deduct_stock_when_fulfilled();

WITH latest_set AS (
  SELECT DISTINCT ON (product_id)
    product_id,
    created_at AS set_at
  FROM public.stock_activity_log
  WHERE change_type = 'manual_set'
    AND product_id IS NOT NULL
  ORDER BY product_id, created_at DESC
), missing_order_products AS (
  SELECT o.id AS order_id,
         o.public_order_number,
         oi.product_id,
         SUM(oi.quantity)::integer AS qty
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  JOIN latest_set ls ON ls.product_id = oi.product_id
  WHERE o.is_fulfilled = true
    AND o.updated_at > ls.set_at
    AND NOT EXISTS (
      SELECT 1
      FROM public.stock_activity_log sal
      WHERE sal.order_id = o.id
        AND sal.product_id = oi.product_id
        AND sal.change_type = 'order_confirm'
    )
  GROUP BY o.id, o.public_order_number, oi.product_id
), running AS (
  SELECT mop.*,
         p.stock_quantity AS current_stock,
         SUM(mop.qty) OVER (
           PARTITION BY mop.product_id
           ORDER BY mop.order_id
           ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
         ) AS prior_qty
  FROM missing_order_products mop
  JOIN public.products p ON p.id = mop.product_id
), inserted AS (
  INSERT INTO public.stock_activity_log
    (product_id, change_type, delta, previous_value, new_value, comment, order_id)
  SELECT product_id,
         'order_confirm',
         GREATEST(current_stock - COALESCE(prior_qty, 0) - qty, 0)
           - GREATEST(current_stock - COALESCE(prior_qty, 0), 0),
         GREATEST(current_stock - COALESCE(prior_qty, 0), 0),
         GREATEST(current_stock - COALESCE(prior_qty, 0) - qty, 0),
         'Historical fulfilled order #' || public_order_number || ' reconciled',
         order_id
  FROM running
  RETURNING product_id
), totals AS (
  SELECT mop.product_id, SUM(mop.qty)::integer AS qty
  FROM missing_order_products mop
  GROUP BY mop.product_id
)
UPDATE public.products p
SET stock_quantity = GREATEST(p.stock_quantity - totals.qty, 0)
FROM totals
WHERE p.id = totals.product_id;