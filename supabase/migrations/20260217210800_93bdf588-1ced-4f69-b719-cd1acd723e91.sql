
-- Add export tracking columns to batches
ALTER TABLE public.batches
  ADD COLUMN IF NOT EXISTS exported_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS exported_by text,
  ADD COLUMN IF NOT EXISTS export_count integer NOT NULL DEFAULT 0;
