-- 1) Clear existing duplicate SKUs by keeping one row per normalized SKU
WITH ranked AS (
  SELECT
    id,
    sku,
    row_number() OVER (
      PARTITION BY lower(btrim(sku))
      ORDER BY synced_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.products
  WHERE btrim(sku) <> ''
)
UPDATE public.products p
SET sku = ''
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

-- 2) Enforce normalized non-empty SKU uniqueness at DB level
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_normalized_idx
ON public.products ((lower(btrim(sku))))
WHERE btrim(sku) <> '';