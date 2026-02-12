
-- Export batches
CREATE TABLE public.export_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT,
  order_count INTEGER NOT NULL DEFAULT 0,
  template_name TEXT,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'completed'
);
ALTER TABLE public.export_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage export_batches" ON public.export_batches FOR ALL USING (is_active_admin(auth.uid()));

-- Export rows (snapshot of each exported order)
CREATE TABLE public.export_rows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.export_batches(id) ON DELETE CASCADE,
  order_id UUID NOT NULL,
  public_order_number TEXT,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.export_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage export_rows" ON public.export_rows FOR ALL USING (is_active_admin(auth.uid()));

-- Import batches
CREATE TABLE public.import_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT,
  file_name TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  matched INTEGER NOT NULL DEFAULT 0,
  unmatched INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'staged',
  applied_at TIMESTAMP WITH TIME ZONE
);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage import_batches" ON public.import_batches FOR ALL USING (is_active_admin(auth.uid()));

-- Import staging rows
CREATE TABLE public.import_staging_rows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  order_ref TEXT,
  tracking_number TEXT,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_status TEXT NOT NULL DEFAULT 'pending',
  matched_order_id UUID,
  matched_order_number TEXT,
  error_message TEXT,
  applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.import_staging_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage import_staging_rows" ON public.import_staging_rows FOR ALL USING (is_active_admin(auth.uid()));

-- Indexes
CREATE INDEX idx_export_rows_batch ON public.export_rows(batch_id);
CREATE INDEX idx_import_staging_batch ON public.import_staging_rows(batch_id);
CREATE INDEX idx_import_batches_status ON public.import_batches(status);
