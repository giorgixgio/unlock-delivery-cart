ALTER TABLE public.product_reviews ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE public.product_review_requests ADD COLUMN IF NOT EXISTS product_id text;
CREATE INDEX IF NOT EXISTS product_reviews_product_id_idx ON public.product_reviews(product_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON public.order_items(product_id);

CREATE OR REPLACE FUNCTION public.product_review_feed(p_sku text, p_product_id text DEFAULT NULL, p_preview boolean DEFAULT false) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'customer_display_name',r.customer_display_name,'city',r.city,'rating',r.rating,'text',r.text,'photo_urls',r.photo_urls,'source',r.source,'status',r.status,'created_at',r.created_at,'verified',r.source='order_link' AND r.order_id IS NOT NULL AND public.camera_order_delivered(r.order_id)) ORDER BY r.created_at DESC),'[]'::jsonb)
 FROM product_reviews r
 WHERE ((p_product_id IS NOT NULL AND r.product_id=p_product_id) OR (r.product_sku=p_sku AND (p_product_id IS NULL OR r.product_id IS NULL OR r.product_id=p_product_id)))
   AND (r.status='approved' OR (p_preview AND r.status='demo' AND r.source='demo')); $$;

CREATE OR REPLACE FUNCTION public.product_landing_stats(p_sku text, p_product_id text DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH items AS (SELECT i.order_id,i.quantity FROM order_items i WHERE i.sku=p_sku OR (p_product_id IS NOT NULL AND i.product_id=p_product_id)),
 p_orders AS (SELECT DISTINCT o.id,o.created_at,o.city FROM orders o JOIN items i ON i.order_id=o.id WHERE NOT o.is_return AND o.status NOT IN ('canceled','cancelled','merged')),
 sold AS (SELECT COALESCE(sum(i.quantity),0) AS n FROM items i JOIN orders o ON o.id=i.order_id WHERE NOT o.is_return AND o.status NOT IN ('canceled','cancelled','merged')),
 recent AS (SELECT city FROM p_orders WHERE created_at>now()-interval '2 hours' AND trim(city)<>'' ORDER BY created_at DESC LIMIT 12)
 SELECT jsonb_build_object('sold_units',(SELECT n FROM sold),'today_orders',(SELECT count(*) FROM p_orders WHERE (created_at AT TIME ZONE 'Asia/Tbilisi')::date=(now() AT TIME ZONE 'Asia/Tbilisi')::date),'recent_cities',COALESCE((SELECT jsonb_agg(city) FROM recent),'[]'::jsonb)); $$;

CREATE OR REPLACE FUNCTION public.product_review_sms_candidates(p_sku text, p_product_id text DEFAULT NULL) RETURNS TABLE(order_id uuid,order_number text,phone text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT o.id,o.public_order_number,o.customer_phone FROM orders o WHERE public.camera_order_delivered(o.id)
 AND EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id AND (i.sku=p_sku OR (p_product_id IS NOT NULL AND i.product_id=p_product_id)))
 AND NOT EXISTS(SELECT 1 FROM product_review_requests r WHERE r.order_id=o.id)
 AND NOT EXISTS(SELECT 1 FROM sms_logs l WHERE l.order_number=o.public_order_number AND l.type='review_request') ORDER BY o.created_at DESC; $$;

CREATE OR REPLACE FUNCTION public.camera_review_feed(p_preview boolean DEFAULT false) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.product_review_feed('002',NULL,p_preview); $$;
CREATE OR REPLACE FUNCTION public.camera_landing_stats() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.product_landing_stats('002',NULL); $$;
CREATE OR REPLACE FUNCTION public.camera_review_sms_candidates() RETURNS TABLE(order_id uuid,order_number text,phone text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT * FROM public.product_review_sms_candidates('002',NULL); $$;

CREATE OR REPLACE FUNCTION public.camera_submit_review(p_token uuid,p_rating integer,p_text text,p_photos jsonb DEFAULT '[]') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_request product_review_requests; v_order orders; v_id uuid; BEGIN SELECT * INTO v_request FROM product_review_requests WHERE token=p_token FOR UPDATE; IF v_request.id IS NULL OR v_request.consumed_at IS NOT NULL OR NOT public.camera_order_delivered(v_request.order_id) THEN RAISE EXCEPTION 'Review link is invalid or already used'; END IF; IF p_rating NOT BETWEEN 1 AND 5 OR length(trim(p_text)) NOT BETWEEN 3 AND 2000 OR jsonb_typeof(p_photos)<>'array' OR jsonb_array_length(p_photos)>3 THEN RAISE EXCEPTION 'Invalid review'; END IF; IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_photos) u WHERE u NOT LIKE 'https://%/storage/v1/object/public/review-photos/'||p_token::text||'/%') THEN RAISE EXCEPTION 'Invalid photo path'; END IF; SELECT * INTO v_order FROM orders WHERE id=v_request.order_id; INSERT INTO product_reviews(product_sku,product_id,order_id,customer_display_name,city,rating,text,photo_urls,source,status) VALUES(COALESCE(v_request.product_sku,'002'),v_request.product_id,v_order.id,split_part(trim(v_order.customer_name),' ',1)||CASE WHEN split_part(trim(v_order.customer_name),' ',2)<>'' THEN ' '||left(split_part(trim(v_order.customer_name),' ',2),1)||'.' ELSE '' END,v_order.city,p_rating,trim(p_text),p_photos,'order_link','pending') RETURNING id INTO v_id; UPDATE product_review_requests SET consumed_at=now() WHERE id=v_request.id; RETURN v_id; END; $$;

REVOKE ALL ON FUNCTION public.product_review_feed(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_review_feed(text,text,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.product_landing_stats(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_landing_stats(text,text) TO anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.product_review_sms_candidates(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_review_sms_candidates(text,text) TO service_role;