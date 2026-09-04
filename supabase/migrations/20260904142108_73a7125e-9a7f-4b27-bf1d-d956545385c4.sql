CREATE TABLE public.wholesale_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.wholesale_batches(id) ON DELETE CASCADE,
  warehouse text NOT NULL CHECK (warehouse IN ('A','B')),
  doc_type text NOT NULL DEFAULT 'invoice' CHECK (doc_type IN ('invoice','packing_list','logistics_invoice','shipping_receipt')),
  file_name text,
  file_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wholesale_documents TO authenticated;
GRANT ALL ON public.wholesale_documents TO service_role;
ALTER TABLE public.wholesale_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage wholesale documents" ON public.wholesale_documents
  FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

CREATE INDEX idx_wholesale_documents_batch ON public.wholesale_documents(batch_id);

ALTER TABLE public.wholesale_items
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS carton_count integer;