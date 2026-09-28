CREATE OR REPLACE FUNCTION public.deduct_stock_when_confirmed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_return IS NOT TRUE AND NEW.status NOT IN ('canceled','cancelled','merged') THEN
    PERFORM public.deduct_order_stock_once(NEW.id, NULL, 'auto');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_deduct_stock_on_confirm ON public.orders;
CREATE TRIGGER orders_deduct_stock_on_confirm
AFTER UPDATE OF is_confirmed ON public.orders
FOR EACH ROW WHEN (NEW.is_confirmed = true AND OLD.is_confirmed IS DISTINCT FROM true)
EXECUTE FUNCTION public.deduct_stock_when_confirmed();

-- Backfill: confirmed, not-yet-shipped orders that never took stock off
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT o.id FROM public.orders o
    WHERE o.is_confirmed AND NOT o.is_fulfilled AND NOT o.is_return
      AND o.status NOT IN ('canceled','cancelled','merged','shipped','delivered')
      AND o.created_at > now() - interval '14 days'
      AND NOT EXISTS (SELECT 1 FROM public.stock_activity_log l WHERE l.order_id = o.id AND l.change_type = 'order_confirm')
    ORDER BY o.created_at
  LOOP
    PERFORM public.deduct_order_stock_once(r.id, NULL, 'auto-backfill');
  END LOOP;
END $$;