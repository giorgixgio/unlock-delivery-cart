ALTER TABLE public.courier_shipments
  ADD COLUMN IF NOT EXISTS onway_shipping_price numeric,
  ADD COLUMN IF NOT EXISTS onway_extra_services_price numeric;

COMMENT ON COLUMN public.courier_shipments.onway_shipping_price IS 'Onway''s own delivery charge for this parcel (shipping_price from the Onway payload)';
COMMENT ON COLUMN public.courier_shipments.onway_extra_services_price IS 'Onway additional services charge (additional_services_price from the Onway payload)';

-- Backfill: recompute what Onway will remit us (collected cash minus Onway's own charges)
-- for every parcel Onway has already reported to us.
WITH wb AS (
  SELECT DISTINCT ON (cs.tracking_number)
    cs.tracking_number AS tn,
    (w.body_json->'order_info'->>'shipping_price')::numeric AS ship,
    coalesce((w.body_json->'order_info'->>'additional_services_price')::numeric, 0) AS extra
  FROM public.courier_shipments cs
  JOIN public.onway_webhook_log w
    ON w.body_json->'order_info'->>'trackingnumber' = cs.tracking_number
  WHERE cs.source = 'api' AND cs.onway_shipping_price IS NULL
  ORDER BY cs.tracking_number, w.received_at DESC
)
UPDATE public.courier_shipments s
SET onway_shipping_price = wb.ship,
    onway_extra_services_price = wb.extra,
    company_receives = CASE
      WHEN s.cod_amount IS NOT NULL AND wb.ship IS NOT NULL
        THEN round((s.cod_amount - wb.ship - wb.extra) * 100) / 100
      ELSE s.company_receives END
FROM wb
WHERE s.tracking_number = wb.tn;
