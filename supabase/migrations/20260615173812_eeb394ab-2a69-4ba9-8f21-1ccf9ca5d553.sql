
-- ============ courier_import_batches ============
CREATE TABLE public.courier_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_hash text UNIQUE,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by text,
  total_rows int NOT NULL DEFAULT 0,
  successful_rows int NOT NULL DEFAULT 0,
  error_rows int NOT NULL DEFAULT 0,
  new_shipments int NOT NULL DEFAULT 0,
  updated_shipments int NOT NULL DEFAULT 0,
  new_history_rows int NOT NULL DEFAULT 0,
  possible_returns int NOT NULL DEFAULT 0,
  auto_linked_returns int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_import_batches TO authenticated;
GRANT ALL ON public.courier_import_batches TO service_role;
ALTER TABLE public.courier_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage courier import batches" ON public.courier_import_batches
  FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

-- ============ courier_shipments ============
CREATE TABLE public.courier_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  tracking_number text NOT NULL UNIQUE,
  order_number text,
  phone text,
  phone_normalized text GENERATED ALWAYS AS (regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) STORED,
  customer_name text,
  city text,
  address text,
  sku text,
  quantity int,
  cod_amount numeric,
  company_receives numeric,
  current_courier_status text,
  derived_status text,
  shipment_type text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  latest_status_date timestamptz,
  linked_original_tracking_number text,
  linked_return_tracking_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX courier_shipments_phone_sku_idx ON public.courier_shipments (phone_normalized, sku);
CREATE INDEX courier_shipments_derived_status_idx ON public.courier_shipments (derived_status);
CREATE INDEX courier_shipments_type_idx ON public.courier_shipments (shipment_type);
CREATE INDEX courier_shipments_latest_status_date_idx ON public.courier_shipments (latest_status_date);
CREATE INDEX courier_shipments_original_order_idx ON public.courier_shipments (original_order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_shipments TO authenticated;
GRANT ALL ON public.courier_shipments TO service_role;
ALTER TABLE public.courier_shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage courier shipments" ON public.courier_shipments
  FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

-- ============ courier_status_history ============
CREATE TABLE public.courier_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_shipment_id uuid NOT NULL REFERENCES public.courier_shipments(id) ON DELETE CASCADE,
  tracking_number text,
  import_batch_id uuid REFERENCES public.courier_import_batches(id) ON DELETE SET NULL,
  courier_status text,
  derived_status text,
  status_date timestamptz,
  cod_amount numeric,
  company_receives numeric,
  raw_row_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX courier_status_history_dedup_idx
  ON public.courier_status_history (courier_shipment_id, COALESCE(courier_status,''), COALESCE(status_date, 'epoch'::timestamptz));
CREATE INDEX courier_status_history_shipment_idx ON public.courier_status_history (courier_shipment_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_status_history TO authenticated;
GRANT ALL ON public.courier_status_history TO service_role;
ALTER TABLE public.courier_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage courier status history" ON public.courier_status_history
  FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

-- ============ return_matches ============
CREATE TABLE public.return_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_shipment_id uuid NOT NULL REFERENCES public.courier_shipments(id) ON DELETE CASCADE,
  return_shipment_id uuid NOT NULL UNIQUE REFERENCES public.courier_shipments(id) ON DELETE CASCADE,
  confidence_score int NOT NULL DEFAULT 0,
  match_reason text,
  matched_by text NOT NULL DEFAULT 'AUTO',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text
);
CREATE INDEX return_matches_original_idx ON public.return_matches (original_shipment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_matches TO authenticated;
GRANT ALL ON public.return_matches TO service_role;
ALTER TABLE public.return_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage return matches" ON public.return_matches
  FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

-- updated_at triggers
CREATE TRIGGER courier_import_batches_updated_at BEFORE UPDATE ON public.courier_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER courier_shipments_updated_at BEFORE UPDATE ON public.courier_shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
