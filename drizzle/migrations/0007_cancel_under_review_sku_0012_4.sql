WITH target AS (
  SELECT DISTINCT o.id
  FROM public.orders o
  JOIN public.order_items i ON i.order_id = o.id
  WHERE i.sku = 'G888-T4656-0012_4'
    AND o.is_confirmed = false
    AND o.is_fulfilled = false
    AND o.is_return = false
    AND o.status NOT IN ('canceled','cancelled','merged','shipped','delivered')
), upd AS (
  UPDATE public.orders o
  SET status = 'canceled',
      call_outcome = 'cancelled',
      call_outcome_updated_at = now(),
      call_outcome_updated_by = 'admin',
      final_cancel_reason = 'out_of_stock',
      operator_review_status = 'cancelled',
      updated_at = now(),
      version = o.version + 1
  FROM target t
  WHERE o.id = t.id
  RETURNING o.id
)
INSERT INTO public.order_events (order_id, actor, event_type, payload)
SELECT id, 'admin', 'call_outcome', jsonb_build_object('outcome','cancelled','source','bulk','cancel_reason','out_of_stock','sku','G888-T4656-0012_4')
FROM upd;