CREATE TABLE public.unidentified_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  typed_sku text NOT NULL,
  position text,
  photo_url text NOT NULL,
  actor text,
  status text NOT NULL DEFAULT 'pending',
  fingerprint_candidates jsonb,
  fingerprint_status text DEFAULT 'pending',
  resolved_product_id text REFERENCES public.products(id),
  resolved_at timestamp with time zone,
  CONSTRAINT unidentified_items_status_check CHECK (status IN ('pending', 'resolved')),
  CONSTRAINT unidentified_items_fingerprint_status_check CHECK (fingerprint_status IN ('pending', 'done', 'failed'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidentified_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidentified_items TO authenticated;
GRANT ALL ON public.unidentified_items TO service_role;

ALTER TABLE public.unidentified_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on unidentified_items" ON public.unidentified_items
  FOR ALL TO public USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.unidentified_items;