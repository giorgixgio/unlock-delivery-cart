CREATE OR REPLACE FUNCTION public.tag_test_sku_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sku = '999999' THEN
    UPDATE public.orders SET tags = array_append(coalesce(tags,'{}'), 'test_sku')
    WHERE id = NEW.order_id AND NOT ('test_sku' = ANY(coalesce(tags,'{}')));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_items_tag_test_sku ON public.order_items;
CREATE TRIGGER order_items_tag_test_sku AFTER INSERT OR UPDATE OF sku ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.tag_test_sku_order();
UPDATE public.orders o SET tags = array_append(coalesce(o.tags,'{}'),'test_sku')
WHERE EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id=o.id AND i.sku='999999')
  AND NOT ('test_sku' = ANY(coalesce(o.tags,'{}')));