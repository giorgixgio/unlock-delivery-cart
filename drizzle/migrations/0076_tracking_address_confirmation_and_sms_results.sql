CREATE OR REPLACE FUNCTION public.tracking_reminder_visit(p_order_id uuid, p_sms_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.sms_logs l WHERE l.id=p_sms_id AND l.order_number=o.public_order_number AND l.status='sent' AND l.type LIKE 'lead_recovery_%') THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.order_events WHERE order_id=o.id AND event_type='reminder_link_opened' AND payload->>'sms_log_id'=p_sms_id::text) THEN
 INSERT INTO public.order_events(order_id,actor,event_type,payload) VALUES(o.id,'customer','reminder_link_opened',jsonb_build_object('source','tracking_page','sms_log_id',p_sms_id));
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.tracking_reminder_visit(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_reminder_visit(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tracking_save_address(p_order_id uuid,p_region_id text,p_address text,p_name text DEFAULT NULL,p_sms_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; v_city text; v_confirm boolean; v_sms uuid; v_already boolean;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
 IF o.status IN ('canceled','cancelled','returned','merged','archived','shipped','delivered') OR o.is_fulfilled IS TRUE OR o.onway_sent_at IS NOT NULL OR nullif(o.onway_tracking,'') IS NOT NULL OR nullif(o.tracking_number,'') IS NOT NULL OR o.packed_at IS NOT NULL THEN RETURN jsonb_build_object('error','closed'); END IF;
 IF NOT (o.address_status='missing' OR o.skipped_address IS TRUE OR nullif(trim(coalesce(o.normalized_city,o.city,'')),'') IS NULL OR nullif(trim(coalesce(o.normalized_address,o.address_line1,'')),'') IS NULL) THEN RETURN jsonb_build_object('error','address_exists'); END IF;
 SELECT name INTO v_city FROM public.onway_regions WHERE id=p_region_id AND active;
 IF v_city IS NULL OR length(trim(coalesce(p_address,''))) NOT BETWEEN 3 AND 300 OR length(coalesce(p_name,''))>100 THEN RETURN jsonb_build_object('error','invalid_address'); END IF;
 SELECT l.id INTO v_sms FROM public.sms_logs l WHERE l.order_number=o.public_order_number AND l.status='sent' AND l.type LIKE 'lead_recovery_%' AND (p_sms_id IS NULL OR l.id=p_sms_id) ORDER BY l.created_at DESC LIMIT 1;
 v_already := coalesce(o.is_confirmed,false) OR coalesce(o.auto_confirmed,false) OR o.status='confirmed';
 v_confirm := NOT v_already AND NOT public.is_test_order(o.id) AND NOT coalesce(o.support_hold,false) AND NOT coalesce(o.is_return,false) AND o.merged_into_order_id IS NULL AND o.status IN ('new','pending_details','pending_address','pending_bump','on_hold');
 UPDATE public.orders SET city=v_city,normalized_city=v_city,region=v_city,raw_city=v_city,address_line1=trim(p_address),normalized_address=trim(p_address),raw_address=trim(p_address),is_tbilisi=p_region_id='1',address_status='completed',address_added_at=now(),skipped_address=false,customer_name=coalesce(nullif(trim(p_name),''),customer_name),
 status=CASE WHEN v_confirm THEN 'confirmed' WHEN status IN ('pending_details','pending_address') THEN 'new' ELSE status END,
 is_confirmed=CASE WHEN v_confirm THEN true ELSE is_confirmed END,auto_confirmed=CASE WHEN v_confirm THEN true ELSE auto_confirmed END,
 auto_confirm_reason=CASE WHEN v_confirm THEN 'Customer confirmed by submitting tracking-page address' ELSE auto_confirm_reason END,
 review_required=CASE WHEN v_confirm THEN false ELSE review_required END,
 queue_locked_by=CASE WHEN v_confirm THEN NULL ELSE queue_locked_by END,queue_locked_until=CASE WHEN v_confirm THEN NULL ELSE queue_locked_until END,
 version=coalesce(version,0)+1 WHERE id=o.id;
 INSERT INTO public.order_events(order_id,actor,event_type,payload) VALUES(o.id,'customer','address_added',jsonb_build_object('source','tracking_page','city',v_city,'sms_log_id',v_sms,'via_sms_link',p_sms_id IS NOT NULL AND v_sms=p_sms_id));
 IF v_confirm THEN INSERT INTO public.order_events(order_id,actor,event_type,payload) VALUES(o.id,'customer','auto_confirm',jsonb_build_object('source','tracking_page','reason','Customer submitted delivery address','sms_log_id',v_sms,'via_sms_link',p_sms_id IS NOT NULL AND v_sms=p_sms_id)); END IF;
 RETURN jsonb_build_object('ok',true,'confirmed',v_confirm OR v_already);
END $$;
REVOKE ALL ON FUNCTION public.tracking_save_address(uuid,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tracking_save_address(uuid,text,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.lead_recovery_results()
RETURNS TABLE(campaign text,sent bigint,delivered bigint,failed bigint,link_opened bigint,address_entered bigint,self_confirmed bigint,address_rate numeric,confirmation_rate numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY WITH rows AS (
 SELECT l.*, EXISTS(SELECT 1 FROM public.order_events e WHERE e.payload->>'sms_log_id'=l.id::text AND e.event_type='reminder_link_opened') AS opened,
 EXISTS(SELECT 1 FROM public.order_events e WHERE e.payload->>'sms_log_id'=l.id::text AND e.event_type='address_added' AND e.payload->>'source'='tracking_page') AS addressed,
 EXISTS(SELECT 1 FROM public.order_events e WHERE e.payload->>'sms_log_id'=l.id::text AND e.event_type='auto_confirm' AND e.payload->>'source'='tracking_page') AS confirmed
 FROM public.sms_logs l WHERE l.type LIKE 'lead_recovery_%')
 SELECT r.type,count(*) FILTER(WHERE r.status='sent'),count(*) FILTER(WHERE r.delivery_status='delivered'),count(*) FILTER(WHERE r.status='failed'),count(*) FILTER(WHERE r.opened),count(*) FILTER(WHERE r.addressed),count(*) FILTER(WHERE r.confirmed),
 round(100.0*count(*) FILTER(WHERE r.addressed)/nullif(count(*) FILTER(WHERE r.status='sent'),0),1),round(100.0*count(*) FILTER(WHERE r.confirmed)/nullif(count(*) FILTER(WHERE r.status='sent'),0),1)
 FROM rows r GROUP BY r.type ORDER BY r.type;
END $$;
REVOKE ALL ON FUNCTION public.lead_recovery_results() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lead_recovery_results() TO authenticated,service_role;
CREATE INDEX IF NOT EXISTS order_events_sms_attribution_idx ON public.order_events ((payload->>'sms_log_id')) WHERE payload->>'sms_log_id' IS NOT NULL;