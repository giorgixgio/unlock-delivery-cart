CREATE TABLE public.onway_order_reviews (order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE, reviewed_version integer NOT NULL, retry_permitted boolean NOT NULL DEFAULT false, reviewed_by text NOT NULL, reviewed_at timestamptz NOT NULL DEFAULT now(), decision text NOT NULL);
GRANT SELECT ON public.onway_order_reviews TO authenticated;
GRANT ALL ON public.onway_order_reviews TO service_role;
ALTER TABLE public.onway_order_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff reads Onway reviews" ON public.onway_order_reviews FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE TABLE public.onway_review_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE, actor text NOT NULL, decision text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.onway_review_events TO authenticated;
GRANT ALL ON public.onway_review_events TO service_role;
ALTER TABLE public.onway_review_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff reads Onway review audit" ON public.onway_review_events FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS onway_error_text text;
CREATE OR REPLACE FUNCTION public.protect_onway_order_fields() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF current_user NOT IN ('postgres','supabase_admin','service_role') THEN
   IF TG_OP='INSERT' THEN
     IF NEW.onway_sent_at IS NOT NULL OR NEW.onway_tracking IS NOT NULL OR NEW.onway_api_status IS NOT NULL OR NEW.onway_error_text IS NOT NULL THEN RAISE EXCEPTION 'Protected Onway shipment fields'; END IF;
   ELSE
     IF NEW.onway_sent_at IS DISTINCT FROM OLD.onway_sent_at OR NEW.onway_tracking IS DISTINCT FROM OLD.onway_tracking OR NEW.onway_api_status IS DISTINCT FROM OLD.onway_api_status OR NEW.onway_error_text IS DISTINCT FROM OLD.onway_error_text THEN RAISE EXCEPTION 'Protected Onway shipment fields'; END IF;
   END IF;
 END IF; RETURN NEW; END; $$;
CREATE TRIGGER protect_onway_order_fields BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.protect_onway_order_fields();
CREATE OR REPLACE FUNCTION public.onway_review_save(p_order_id uuid, p_version integer, p_region_id text, p_address text, p_name text, p_phone text, p_actor text, p_decision text, p_tracking text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; r public.onway_regions; v integer;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR o.status<>'confirmed' OR NOT o.is_confirmed OR o.is_fulfilled THEN RAISE EXCEPTION 'Order is not eligible'; END IF;
 IF o.version<>p_version THEN RAISE EXCEPTION 'Order changed; refresh before reviewing'; END IF;
 IF nullif(trim(o.onway_tracking),'') IS NOT NULL OR o.onway_api_status='sent' THEN RAISE EXCEPTION 'Already sent'; END IF;
 IF p_decision NOT IN ('confirm','exists','not_exists') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF o.onway_sent_at IS NOT NULL AND p_decision='confirm' AND o.onway_api_status IS DISTINCT FROM 'rejected' THEN RAISE EXCEPTION 'Verify existence in Onway first'; END IF;
 IF p_decision IN ('exists','not_exists') AND o.onway_sent_at IS NULL THEN RAISE EXCEPTION 'Order has never been sent'; END IF;
 IF p_decision='exists' THEN
   IF nullif(trim(p_tracking),'') IS NULL OR length(p_tracking)>100 THEN RAISE EXCEPTION 'Enter tracking'; END IF;
   UPDATE public.orders SET onway_tracking=trim(p_tracking),tracking_number=trim(p_tracking),courier_name='ONWAY',onway_api_status='sent',onway_error_text=NULL,version=version+1 WHERE id=p_order_id;
 ELSE
   SELECT * INTO r FROM public.onway_regions WHERE id=p_region_id AND active;
   IF r.id IS NULL OR length(trim(p_address))<1 OR length(p_address)>300 OR length(trim(p_name))<1 OR length(p_name)>255 OR p_phone !~ '^(\+?995)?5[0-9]{8}$' THEN RAISE EXCEPTION 'Select city and enter valid name, phone and address'; END IF;
   v:=o.version+1;
   UPDATE public.orders SET city=r.name,region=r.name,normalized_city=r.name,normalized_address=trim(p_address),address_line1=trim(p_address),customer_name=trim(p_name),customer_phone=p_phone,is_tbilisi=(r.id='1'),operator_review_status='confirmed',call_outcome='confirmed',call_outcome_updated_by=p_actor,call_outcome_updated_at=now(),normalization_confidence=1,review_required=false,version=v WHERE id=p_order_id;
   INSERT INTO public.onway_order_reviews(order_id,reviewed_version,retry_permitted,reviewed_by,decision) VALUES(p_order_id,v,o.onway_sent_at IS NOT NULL,p_actor,p_decision) ON CONFLICT(order_id) DO UPDATE SET reviewed_version=excluded.reviewed_version,retry_permitted=excluded.retry_permitted,reviewed_by=excluded.reviewed_by,reviewed_at=now(),decision=excluded.decision;
 END IF;
 INSERT INTO public.onway_review_events(order_id,actor,decision,payload) VALUES(p_order_id,p_actor,p_decision,jsonb_build_object('region_id',p_region_id,'previous_version',o.version,'tracking',p_tracking));
 RETURN jsonb_build_object('ok',true);
END; $$;
REVOKE ALL ON FUNCTION public.onway_review_save(uuid,integer,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.onway_review_save(uuid,integer,text,text,text,text,text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.onway_claim_shipment(p_order_id uuid, p_version integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders; permit public.onway_order_reviews;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR o.version<>p_version OR o.status<>'confirmed' OR NOT o.is_confirmed OR o.is_fulfilled OR nullif(trim(o.onway_tracking),'') IS NOT NULL OR o.onway_api_status='sent' THEN RETURN false; END IF;
 SELECT * INTO permit FROM public.onway_order_reviews WHERE order_id=p_order_id FOR UPDATE;
 IF o.onway_sent_at IS NOT NULL AND NOT(coalesce(permit.retry_permitted,false) AND permit.reviewed_version=o.version) THEN RETURN false; END IF;
 UPDATE public.onway_order_reviews SET retry_permitted=false WHERE order_id=p_order_id;
 UPDATE public.orders SET onway_sent_at=now(),onway_api_status='sending',onway_error_text=NULL,version=version+1 WHERE id=p_order_id;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.onway_claim_shipment(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.onway_claim_shipment(uuid,integer) TO service_role;