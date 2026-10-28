CREATE OR REPLACE FUNCTION public.notify_telegram_new_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN RETURN NEW; END; $$;
COMMENT ON FUNCTION public.notify_telegram_new_order() IS 'Lead Telegram alerts disabled at owner request; retained as a no-op for compatibility.';
CREATE OR REPLACE FUNCTION public.notify_telegram_bulk_fulfilled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor text;
BEGIN
 IF NEW.store = 'B' AND NEW.status IN ('completed','partial') AND OLD.status='applying' AND NEW.applied_at IS NOT NULL THEN
  SELECT email INTO v_actor FROM public.admin_users WHERE id=auth.uid();
  PERFORM public.dispatch_telegram_owner_alert(jsonb_build_object('type','bulk_fulfilled','batch_id',NEW.id,'actor',COALESCE(v_actor,NEW.created_by,'unknown')));
 END IF;
 RETURN NEW;
END; $$;