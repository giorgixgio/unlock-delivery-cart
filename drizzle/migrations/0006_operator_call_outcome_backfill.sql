CREATE INDEX IF NOT EXISTS idx_order_events_call_outcome_period
  ON public.order_events (created_at DESC, actor, order_id)
  WHERE event_type = 'call_outcome';

INSERT INTO public.order_events (order_id, created_at, actor, event_type, payload)
SELECT
  legacy.order_id,
  legacy.created_at,
  legacy.actor,
  'call_outcome',
  legacy.payload || jsonb_strip_nulls(jsonb_build_object(
    'outcome', CASE legacy.event_type
      WHEN 'call_attempt' THEN 'no_answer'
      WHEN 'callback_scheduled' THEN 'callback'
      ELSE 'cancelled'
    END,
    'attempt_number', COALESCE(legacy.payload->'attempt_number', legacy.payload->'attempt_count'),
    'cancel_reason', legacy.payload->'reason',
    'order_created_at', orders.created_at,
    'backfilled', true,
    'backfill_source_id', legacy.id,
    'backfill_source_table', 'order_events'
  ))
FROM public.order_events legacy
JOIN public.orders ON orders.id = legacy.order_id
WHERE legacy.event_type IN ('call_attempt', 'callback_scheduled', 'order_canceled')
  AND NOT EXISTS (
    SELECT 1 FROM public.order_events existing
    WHERE existing.event_type = 'call_outcome'
      AND existing.payload->>'backfill_source_id' = legacy.id::text
  );

INSERT INTO public.order_events (order_id, created_at, actor, event_type, payload)
SELECT
  source.order_id,
  source.created_at,
  source.actor_id,
  'call_outcome',
  source.payload_json || jsonb_build_object(
    'outcome', 'confirmed',
    'order_created_at', orders.created_at,
    'backfilled', true,
    'backfill_source_id', source.event_id,
    'backfill_source_table', 'system_events'
  )
FROM (
  SELECT event_id, entity_id::uuid AS order_id, created_at,
         COALESCE(actor_id, 'system') AS actor_id, payload_json
  FROM public.system_events
  WHERE event_type = 'ORDER_CALL_OUTCOME'
    AND payload_json->>'outcome' = 'confirmed'
    AND entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
) source
JOIN public.orders ON orders.id = source.order_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.order_events existing
  WHERE existing.event_type = 'call_outcome'
    AND existing.payload->>'backfill_source_id' = source.event_id::text
);