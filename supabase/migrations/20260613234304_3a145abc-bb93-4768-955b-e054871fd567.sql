CREATE OR REPLACE FUNCTION public.bulk_update_tracking(rows jsonb)
RETURNS TABLE(updated_count integer, missing_order_ids text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
  v_missing text[] := ARRAY[]::text[];
  v_input_ids uuid[];
  v_found_ids uuid[];
BEGIN
  -- Parse incoming JSON rows: [{ "order_id": "...uuid...", "tracking_number": "..." }, ...]
  WITH incoming AS (
    SELECT
      (elem->>'order_id')::uuid AS order_id,
      NULLIF(trim(elem->>'tracking_number'), '') AS tracking_number
    FROM jsonb_array_elements(rows) AS elem
  ),
  filtered AS (
    SELECT order_id, tracking_number
    FROM incoming
    WHERE order_id IS NOT NULL AND tracking_number IS NOT NULL
  ),
  upd AS (
    UPDATE public.orders o
    SET tracking_number = f.tracking_number,
        updated_at = now()
    FROM filtered f
    WHERE o.id = f.order_id
      AND (o.tracking_number IS DISTINCT FROM f.tracking_number)
    RETURNING o.id
  )
  SELECT
    (SELECT count(*)::int FROM upd),
    ARRAY(
      SELECT DISTINCT (elem->>'order_id')
      FROM jsonb_array_elements(rows) AS elem
      WHERE (elem->>'order_id') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.orders o2 WHERE o2.id = (elem->>'order_id')::uuid
        )
    )
  INTO v_updated, v_missing;

  updated_count := v_updated;
  missing_order_ids := v_missing;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_update_tracking(jsonb) TO authenticated, service_role;