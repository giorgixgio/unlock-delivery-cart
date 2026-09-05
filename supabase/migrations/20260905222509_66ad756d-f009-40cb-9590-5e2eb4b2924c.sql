ALTER TABLE public.import_batches ADD COLUMN IF NOT EXISTS store text;
ALTER TABLE public.import_batches DROP CONSTRAINT IF EXISTS import_batches_store_check;
ALTER TABLE public.import_batches ADD CONSTRAINT import_batches_store_check CHECK (store IS NULL OR store IN ('A','B'));
CREATE INDEX IF NOT EXISTS idx_import_batches_store ON public.import_batches (store);