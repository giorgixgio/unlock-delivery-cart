CREATE TABLE public.wholesale_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number text UNIQUE NOT NULL,
  warehouse text NOT NULL CHECK (warehouse IN ('A','B')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wholesale_batches TO authenticated;
GRANT ALL ON public.wholesale_batches TO service_role;
ALTER TABLE public.wholesale_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wholesale batches" ON public.wholesale_batches
  FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

CREATE TABLE public.wholesale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.wholesale_batches(id) ON DELETE SET NULL,
  warehouse text NOT NULL CHECK (warehouse IN ('A','B')),
  sku text UNIQUE NOT NULL,
  title text,
  image_url text,
  alibaba_link text,
  unit_price numeric,
  weight_kg numeric,
  notes text,
  logistics_stage text NOT NULL DEFAULT 'ordered' CHECK (logistics_stage IN ('ordered','at_freight_forwarder','in_transit','arrived','cleared_customs')),
  listing_status text NOT NULL DEFAULT 'not_listed' CHECK (listing_status IN ('not_listed','draft','published')),
  storefront_product_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wholesale_items TO authenticated;
GRANT ALL ON public.wholesale_items TO service_role;
ALTER TABLE public.wholesale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wholesale items" ON public.wholesale_items
  FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

CREATE INDEX idx_wholesale_items_batch ON public.wholesale_items(batch_id);
CREATE INDEX idx_wholesale_items_warehouse ON public.wholesale_items(warehouse);

CREATE TRIGGER trg_wholesale_items_updated_at
BEFORE UPDATE ON public.wholesale_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_wholesale_item(p_batch_id uuid)
RETURNS public.wholesale_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_batch public.wholesale_batches;
  v_seq integer;
  v_sku text;
  v_row public.wholesale_items;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  SELECT * INTO v_batch FROM public.wholesale_batches WHERE id = p_batch_id FOR UPDATE;
  IF v_batch.id IS NULL THEN RAISE EXCEPTION 'batch not found'; END IF;

  SELECT COALESCE(MAX(NULLIF(regexp_replace(i.sku, '^.*-', ''), '')::int), 0) + 1
    INTO v_seq
  FROM public.wholesale_items i
  WHERE i.batch_id = p_batch_id;

  v_sku := v_batch.warehouse || '-' || v_batch.batch_number || '-' || lpad(v_seq::text, 3, '0');

  INSERT INTO public.wholesale_items (batch_id, warehouse, sku)
  VALUES (p_batch_id, v_batch.warehouse, v_sku)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_wholesale_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_wholesale_item(uuid) TO authenticated, service_role;