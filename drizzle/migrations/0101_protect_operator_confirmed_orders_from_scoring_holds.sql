CREATE OR REPLACE FUNCTION public.orders_confirmed_hold_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_confirmed = true AND NEW.is_confirmed = true
     AND NEW.status = 'on_hold' AND OLD.status IS DISTINCT FROM 'on_hold'
     AND coalesce(current_setting('app.allow_confirmed_hold', true), '') <> '1' THEN
    NEW.status := OLD.status;
    NEW.review_required := OLD.review_required;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_confirmed_hold_guard_trg
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_confirmed_hold_guard();

CREATE OR REPLACE FUNCTION public.orders_intentional_hold(
  p_order_id uuid, p_updates jsonb, p_expected_version integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_patch public.orders;
  v_version integer;
  v_previous_override text := coalesce(current_setting('app.allow_confirmed_hold', true), '');
BEGIN
  IF NOT coalesce(public.is_active_staff(auth.uid()), false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object'
     OR p_updates->>'status' IS DISTINCT FROM 'on_hold'
     OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_updates) k WHERE k NOT IN (
       'status','assigned_to','internal_note','courier_name','tracking_number','tracking_url',
       'next_call_after','call_outcome','operator_review_status','call_outcome_updated_at','call_outcome_updated_by'
     )) THEN
    RAISE EXCEPTION 'Invalid hold update';
  END IF;
  v_patch := jsonb_populate_record(NULL::public.orders, p_updates);
  PERFORM set_config('app.allow_confirmed_hold', '1', true);
  UPDATE public.orders o SET
    status = 'on_hold',
    assigned_to = CASE WHEN p_updates ? 'assigned_to' THEN v_patch.assigned_to ELSE o.assigned_to END,
    internal_note = CASE WHEN p_updates ? 'internal_note' THEN v_patch.internal_note ELSE o.internal_note END,
    courier_name = CASE WHEN p_updates ? 'courier_name' THEN v_patch.courier_name ELSE o.courier_name END,
    tracking_number = CASE WHEN p_updates ? 'tracking_number' THEN v_patch.tracking_number ELSE o.tracking_number END,
    tracking_url = CASE WHEN p_updates ? 'tracking_url' THEN v_patch.tracking_url ELSE o.tracking_url END,
    next_call_after = CASE WHEN p_updates ? 'next_call_after' THEN v_patch.next_call_after ELSE o.next_call_after END,
    call_outcome = CASE WHEN p_updates ? 'call_outcome' THEN v_patch.call_outcome ELSE o.call_outcome END,
    operator_review_status = CASE WHEN p_updates ? 'operator_review_status' THEN v_patch.operator_review_status ELSE o.operator_review_status END,
    call_outcome_updated_at = CASE WHEN p_updates ? 'call_outcome_updated_at' THEN v_patch.call_outcome_updated_at ELSE o.call_outcome_updated_at END,
    call_outcome_updated_by = CASE WHEN p_updates ? 'call_outcome_updated_by' THEN v_patch.call_outcome_updated_by ELSE o.call_outcome_updated_by END,
    version = CASE WHEN p_expected_version IS NOT NULL THEN p_expected_version + 1 ELSE o.version END
  WHERE o.id = p_order_id AND (p_expected_version IS NULL OR o.version = p_expected_version)
  RETURNING o.version INTO v_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFLICT: Order was updated by another user or is not accessible.';
  END IF;
  PERFORM set_config('app.allow_confirmed_hold', v_previous_override, true);
  RETURN v_version;
END;
$$;
REVOKE ALL ON FUNCTION public.orders_intentional_hold(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orders_intentional_hold(uuid, jsonb, integer) TO authenticated;
