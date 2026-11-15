-- Run as one statement: the inner exception rolls back all fixtures and outcomes.
DO $$
DECLARE v_id uuid := gen_random_uuid(); v_sms uuid := gen_random_uuid(); r jsonb; n int;
BEGIN
 BEGIN
  INSERT INTO public.orders(id,public_order_number,customer_name,customer_phone,status,city,address_status,skipped_address,tags)
  VALUES(v_id,'recovery-verification-'||v_id,'Verification','','pending_details','','missing',true,'{}');
  INSERT INTO public.sms_logs(id,order_number,type,status,content)
  VALUES(v_sms,'recovery-verification-'||v_id,'lead_recovery_verification','sent','verification');
  PERFORM public.tracking_reminder_visit(v_id,v_sms);
  PERFORM public.tracking_reminder_visit(v_id,v_sms);
  SELECT count(*) INTO n FROM public.order_events WHERE order_id=v_id AND event_type='reminder_link_opened';
  IF n<>1 THEN RAISE EXCEPTION 'Visit deduplication failed'; END IF;
  r := public.tracking_save_address(v_id,'not-a-city','ქუჩა 12',NULL,v_sms);
  IF r->>'error'<>'invalid_address' THEN RAISE EXCEPTION 'Invalid city accepted'; END IF;
  r := public.tracking_save_address(v_id,'1','ქუჩა 12',NULL,v_sms);
  IF r->>'confirmed'<>'true' THEN RAISE EXCEPTION 'Address did not confirm'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=v_id AND status='confirmed' AND is_confirmed AND auto_confirmed AND call_outcome IS NULL AND city='თბილისი' AND address_line1='ქუჩა 12') THEN RAISE EXCEPTION 'Confirmation state mismatch'; END IF;
  SELECT count(*) INTO n FROM public.order_events WHERE order_id=v_id AND event_type='auto_confirm' AND payload->>'sms_log_id'=v_sms::text;
  IF n<>1 THEN RAISE EXCEPTION 'SMS attribution missing'; END IF;
  r := public.tracking_save_address(v_id,'1','ქუჩა 12',NULL,v_sms);
  IF r->>'error'<>'address_exists' THEN RAISE EXCEPTION 'Duplicate submission accepted'; END IF;
  INSERT INTO public.orders(id,public_order_number,customer_name,customer_phone,status,city,address_status,skipped_address,tags,support_hold)
  VALUES(gen_random_uuid(),'recovery-held-'||v_id,'Verification','','new','','missing',true,'{}',true) RETURNING id INTO v_id;
  r := public.tracking_save_address(v_id,'1','ქუჩა 12');
  IF r->>'confirmed'<>'false' THEN RAISE EXCEPTION 'Support hold bypassed'; END IF;
  INSERT INTO public.orders(id,public_order_number,customer_name,customer_phone,status,city,address_status,skipped_address,tags)
  VALUES(gen_random_uuid(),'recovery-test-'||v_id,'Verification','','new','','missing',true,ARRAY['test_sku']) RETURNING id INTO v_id;
  r := public.tracking_save_address(v_id,'1','ქუჩა 12');
  IF r->>'confirmed'<>'false' THEN RAISE EXCEPTION 'Test isolation bypassed'; END IF;
  INSERT INTO public.orders(id,public_order_number,customer_name,customer_phone,status,city,address_status,tags)
  VALUES(gen_random_uuid(),'recovery-cancel-'||v_id,'Verification','','canceled','','missing','{}') RETURNING id INTO v_id;
  r := public.tracking_save_address(v_id,'1','ქუჩა 12');
  IF r->>'error'<>'closed' THEN RAISE EXCEPTION 'Cancelled order revived'; END IF;
  IF has_function_privilege('anon','public.tracking_save_address(uuid,text,text,text,uuid)','EXECUTE') OR has_function_privilege('authenticated','public.tracking_save_address(uuid,text,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Public write access'; END IF;
  RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Verification passed; rolling back fixtures';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN
  RAISE NOTICE 'PASS: address confirmation, SMS attribution, duplicate protection, holds, test isolation, cancelled protection, service-only writes; all fixtures rolled back';
 END;
END $$;