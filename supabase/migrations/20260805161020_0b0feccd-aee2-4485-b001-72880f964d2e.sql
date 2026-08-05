CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS visual_fingerprint text,
  ADD COLUMN IF NOT EXISTS fingerprint_generated_at timestamptz;

CREATE INDEX IF NOT EXISTS products_visual_fingerprint_trgm_idx
  ON public.products USING gin (visual_fingerprint gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.match_products_by_fingerprint(
  query_fp text,
  exclude_id text DEFAULT NULL,
  match_limit int DEFAULT 10
)
RETURNS TABLE(
  id text,
  sku text,
  title text,
  description text,
  image text,
  images jsonb,
  similarity real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.sku, p.title, p.description, p.image, p.images,
         similarity(p.visual_fingerprint, query_fp) AS similarity
  FROM public.products p
  WHERE p.visual_fingerprint IS NOT NULL
    AND (exclude_id IS NULL OR p.id <> exclude_id)
  ORDER BY similarity(p.visual_fingerprint, query_fp) DESC
  LIMIT GREATEST(COALESCE(match_limit, 10), 1);
$$;

REVOKE ALL ON FUNCTION public.match_products_by_fingerprint(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_products_by_fingerprint(text, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_products_by_fingerprint(text, text, int) TO authenticated;