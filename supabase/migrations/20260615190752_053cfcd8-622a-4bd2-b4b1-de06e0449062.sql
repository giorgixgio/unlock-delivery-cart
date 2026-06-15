ALTER TABLE public.courier_import_batches
  ADD COLUMN IF NOT EXISTS skipped_rows integer NOT NULL DEFAULT 0;