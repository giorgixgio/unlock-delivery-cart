CREATE TABLE public.products_sku_backup_20260807 AS
SELECT p.id, p.title, p.sku, p.bin_location, p.sku_locked, now() AS backed_up_at
FROM public.products p
WHERE p.sku IS NOT NULL AND p.sku <> ''
  AND p.sku IN (
    SELECT sku FROM public.products
    WHERE sku IS NOT NULL AND sku <> ''
    GROUP BY sku
    HAVING count(*) > 1 AND count(*) FILTER (WHERE sku_locked) = 1
  );

ALTER TABLE public.products_sku_backup_20260807 ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.products_sku_backup_20260807 TO service_role;
GRANT SELECT ON public.products_sku_backup_20260807 TO authenticated;
CREATE POLICY "Admins can read sku backup" ON public.products_sku_backup_20260807
FOR SELECT TO authenticated USING (public.is_active_admin(auth.uid()));