ALTER TABLE public.wholesale_items
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS hs_code text,
  ADD COLUMN IF NOT EXISTS hs_confidence text,
  ADD COLUMN IF NOT EXISTS hs_requires_certification boolean,
  ADD COLUMN IF NOT EXISTS hs_notes text,
  ADD COLUMN IF NOT EXISTS hs_reviewed boolean NOT NULL DEFAULT false;

UPDATE public.wholesale_items
SET images = jsonb_build_array(image_url)
WHERE image_url IS NOT NULL
  AND image_url <> ''
  AND (images IS NULL OR jsonb_array_length(images) = 0);