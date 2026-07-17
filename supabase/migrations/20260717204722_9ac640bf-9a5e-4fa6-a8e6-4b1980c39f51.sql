
-- Fix guard trigger: remove references to non-existent columns (confirmed_by, canceled_by)
CREATE OR REPLACE FUNCTION public.orders_anon_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('role', true) = 'anon' OR auth.role() = 'anon' THEN
    IF NEW.is_confirmed IS DISTINCT FROM OLD.is_confirmed
       OR NEW.auto_confirmed IS DISTINCT FROM OLD.auto_confirmed
       OR NEW.is_fulfilled IS DISTINCT FROM OLD.is_fulfilled
       OR NEW.review_required IS DISTINCT FROM OLD.review_required
       OR NEW.risk_score IS DISTINCT FROM OLD.risk_score
       OR NEW.risk_level IS DISTINCT FROM OLD.risk_level
       OR NEW.packing_wave_id IS DISTINCT FROM OLD.packing_wave_id
       OR NEW.packing_status IS DISTINCT FROM OLD.packing_status
       OR NEW.public_order_number IS DISTINCT FROM OLD.public_order_number
       OR NEW.tracking_number IS DISTINCT FROM OLD.tracking_number
    THEN
      RAISE EXCEPTION 'anon cannot modify protected order columns';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('new','pending_details','pending_address') THEN
      RAISE EXCEPTION 'anon cannot set status to %', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Allow anon to read order_items for their fresh order (matches orders anon SELECT window)
CREATE POLICY "Anon can view items on fresh order"
ON public.order_items
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.created_at > (now() - interval '2 hours')
  )
);
