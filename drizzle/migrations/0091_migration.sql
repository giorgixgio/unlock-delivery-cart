DO $$ DECLARE c text; BEGIN
 SELECT conname INTO c FROM pg_constraint WHERE conrelid='public.sms_logs'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%lead_recovery%';
 EXECUTE format('ALTER TABLE public.sms_logs DROP CONSTRAINT %I', c);
END $$;
ALTER TABLE public.sms_logs ADD CONSTRAINT sms_logs_type_check CHECK (
 type = ANY (ARRAY['confirmation','fulfillment','review_request','lead_created','order_auto_confirmed','call_no_answer','call_no_answer_2','order_confirmed','out_for_delivery','delivery_failed','delivery_failed_2','address_problem','address_problem_2','refund_link'])
 OR type ~ '^support_(ack|followup|update)(_[0-9]+)?$'
 OR type ~ '^lead_recovery_[a-zA-Z0-9_]+$'
 OR type ~ '^campaign_[a-zA-Z0-9_]+$');