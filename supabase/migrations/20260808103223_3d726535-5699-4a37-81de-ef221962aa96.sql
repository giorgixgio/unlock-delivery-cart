WITH dups AS (
  SELECT sku FROM public.products
  WHERE sku ~ '^[0-9]+$' AND sku::int < 1000
  GROUP BY sku HAVING count(*) > 1
),
ranked AS (
  SELECT p.id, p.sku,
         row_number() OVER (
           PARTITION BY p.sku
           ORDER BY p.sku_locked DESC,
                    (EXISTS (SELECT 1 FROM public.product_scan_history h
                              WHERE h.status = 'confirmed' AND h.confirmed_product_id = p.id)) DESC,
                    p.created_at ASC
         ) AS rn
  FROM public.products p
  JOIN dups d ON d.sku = p.sku
)
UPDATE public.products p
SET sku = r.sku || '_' || r.rn,
    bin_location = r.sku || '_' || r.rn,
    previous_sku = r.sku,
    sku_reassigned = true,
    sku_reassigned_at = now(),
    sku_locked = true
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;