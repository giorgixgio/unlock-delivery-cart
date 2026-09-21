-- 1) Additive columns on courier_shipments
ALTER TABLE public.courier_shipments
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS receiver_name text,
  ADD COLUMN IF NOT EXISTS order_date timestamptz,
  ADD COLUMN IF NOT EXISTS pickup_date timestamptz,
  ADD COLUMN IF NOT EXISTS final_status_date timestamptz,
  ADD COLUMN IF NOT EXISTS comment_raw text,
  ADD COLUMN IF NOT EXISTS comment_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_return boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS derived_state text;

CREATE INDEX IF NOT EXISTS idx_courier_shipments_state ON public.courier_shipments (derived_state, latest_status_date);
CREATE INDEX IF NOT EXISTS idx_courier_shipments_phone ON public.courier_shipments (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_courier_shipments_order_number ON public.courier_shipments (order_number);
CREATE INDEX IF NOT EXISTS idx_courier_shipments_is_return ON public.courier_shipments (is_return);

-- 2) Batch coverage + conflicts + failure info
ALTER TABLE public.courier_import_batches
  ADD COLUMN IF NOT EXISTS covered_from date,
  ADD COLUMN IF NOT EXISTS covered_to date,
  ADD COLUMN IF NOT EXISTS conflicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS linked_returns integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unlinked_returns integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conflict_rows integer NOT NULL DEFAULT 0;

-- 3) Configurable status mapping
CREATE TABLE IF NOT EXISTS public.courier_status_map (
  courier_status text PRIMARY KEY,
  label_ka text,
  label_en text,
  outbound_state text NOT NULL DEFAULT 'IN_PROGRESS',
  outbound_counts_as text NOT NULL DEFAULT 'in_progress',
  outbound_is_final boolean NOT NULL DEFAULT false,
  return_state text NOT NULL DEFAULT 'IN_PROGRESS',
  return_counts_as text NOT NULL DEFAULT 'excluded',
  return_is_final boolean NOT NULL DEFAULT false,
  is_return_collected boolean NOT NULL DEFAULT false,
  is_return_in_transit boolean NOT NULL DEFAULT false,
  counts_as_collected_outbound boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_status_map TO authenticated;
GRANT ALL ON public.courier_status_map TO service_role;
ALTER TABLE public.courier_status_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage courier_status_map" ON public.courier_status_map
  FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

INSERT INTO public.courier_status_map
  (courier_status, label_ka, label_en, outbound_state, outbound_counts_as, outbound_is_final,
   return_state, return_counts_as, return_is_final, is_return_collected, is_return_in_transit,
   counts_as_collected_outbound, sort_order)
VALUES
  ('ჩაბარებული','ჩაბარებული','Delivered','DELIVERED','delivered',true,'RETURN_COLLECTED','excluded',true,true,false,false,10),
  ('არ ჩაბარდა/დასრულებული','არ ჩაბარდა/დასრულებული','Failed (final)','FAILED_FINAL','failed',true,'RETURN_FAILED','excluded',true,false,false,false,20),
  ('არ ჩაბარდა','არ ჩაბარდა','Failed attempt (retry)','FAILED_ATTEMPT','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,30),
  ('ფილიალიდან გაცემა','ფილიალიდან გაცემა','Collected from branch','RETURNED_FAILED','failed',true,'RETURN_COLLECTED','excluded',true,true,false,true,40),
  ('მიღების გაუქმება','მიღების გაუქმება','Pickup cancelled','CANCELLED_EXCLUDED','excluded',true,'RETURN_CANCELLED','excluded',true,false,false,false,50),
  ('აღების გაუქმება','აღების გაუქმება','Collection cancelled','CANCELLED_EXCLUDED','excluded',true,'RETURN_CANCELLED','excluded',true,false,false,false,51),
  ('შეკვეთის გაუქმება','შეკვეთის გაუქმება','Order cancelled','CANCELLED_EXCLUDED','excluded',true,'RETURN_CANCELLED','excluded',true,false,false,false,52),
  ('საწყობში','საწყობში','In warehouse','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,60),
  ('გაგზავნილი ფილიალში','გაგზავნილი ფილიალში','Sent to branch','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,61),
  ('უბრუნდება გამგზავნს','უბრუნდება გამგზავნს','Returning to sender','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,62),
  ('აღებული','აღებული','Picked up','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,63),
  ('გაფორმებული','გაფორმებული','Registered','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,64),
  ('ხელმეორედ გატანა','ხელმეორედ გატანა','Second attempt','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,65),
  ('ჩაბარების გადადება','ჩაბარების გადადება','Delivery postponed','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,66),
  ('გაიტანს ფილიალიდან','გაიტანს ფილიალიდან','Pickup at branch','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,67),
  ('ელოდება ვიზირებას','ელოდება ვიზირებას','Awaiting approval','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,68),
  ('დაყოვნებული','დაყოვნებული','Delayed','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,69),
  ('ასაღები','ასაღები','To be picked up','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,70),
  ('გატანილი ჩასაბარებლად','გატანილი ჩასაბარებლად','Out for delivery','IN_PROGRESS','in_progress',false,'IN_PROGRESS','excluded',false,false,true,false,71)
ON CONFLICT (courier_status) DO NOTHING;

-- 4) Alert thresholds
CREATE TABLE IF NOT EXISTS public.courier_alert_settings (
  rule_key text PRIMARY KEY,
  label text NOT NULL,
  threshold_days integer NOT NULL DEFAULT 3,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_alert_settings TO authenticated;
GRANT ALL ON public.courier_alert_settings TO service_role;
ALTER TABLE public.courier_alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage courier_alert_settings" ON public.courier_alert_settings
  FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

INSERT INTO public.courier_alert_settings (rule_key, label, threshold_days, sort_order) VALUES
  ('warehouse_stuck','გასაგზავნი საწყობში დიდი ხანია (საწყობში)',3,10),
  ('failed_attempt_stuck','არ ჩაბარდა (არასაბოლოო) დიდი ხანია',3,20),
  ('no_status_change','მიმდინარე გზავნილს სტატუსი არ შეცვლია',5,30),
  ('return_in_transit','დასაბრუნებელი გზავნილი გზაშია დიდი ხანია',5,40),
  ('shipped_missing_in_courier','ჩვენთან გაგზავნილია, კურიერის ფაილში არ არის',2,50),
  ('delivered_with_return','ჩაბარებულია, მაგრამ დაბრუნებაც აქვს',0,60)
ON CONFLICT (rule_key) DO NOTHING;

-- 5) Retro-remap existing shipments into derived_state (derived_status untouched)
UPDATE public.courier_shipments s
SET is_return = true
WHERE s.shipment_type = 'RETURN_TO_SENDER' AND s.is_return = false;

UPDATE public.courier_shipments s
SET derived_state = CASE WHEN s.is_return THEN m.return_state ELSE m.outbound_state END,
    status_changed_at = COALESCE(s.status_changed_at, s.latest_status_date, s.updated_at)
FROM public.courier_status_map m
WHERE m.courier_status = s.current_courier_status
  AND s.derived_state IS DISTINCT FROM (CASE WHEN s.is_return THEN m.return_state ELSE m.outbound_state END);

UPDATE public.courier_shipments
SET derived_state = 'IN_PROGRESS',
    status_changed_at = COALESCE(status_changed_at, latest_status_date, updated_at)
WHERE derived_state IS NULL;

-- 6) Repair the stuck Aug 7 batch using real history counts
UPDATE public.courier_import_batches b
SET status = 'completed',
    finalized_at = now(),
    successful_rows = GREATEST(b.successful_rows, h.cnt),
    new_history_rows = GREATEST(b.new_history_rows, h.cnt),
    error_message = 'Auto-repaired: import wrote data but never finalized'
FROM (
  SELECT import_batch_id, count(*)::int AS cnt
  FROM public.courier_status_history
  WHERE import_batch_id IS NOT NULL
  GROUP BY import_batch_id
) h
WHERE h.import_batch_id = b.id AND b.status = 'processing';

UPDATE public.courier_import_batches
SET status = 'failed', finalized_at = now(),
    error_message = COALESCE(error_message, 'Import never finalized and wrote no rows')
WHERE status = 'processing' AND uploaded_at < now() - interval '1 hour';