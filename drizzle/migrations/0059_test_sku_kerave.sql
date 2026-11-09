CREATE OR REPLACE FUNCTION public.tag_test_sku_order()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.sku = '999999' OR lower(NEW.sku) IN ('test1','test2','test3','test4','test5','test6','test7','test8','test9','testkrema','testwarbi') THEN
    UPDATE public.orders SET tags = array_append(coalesce(tags,'{}'), 'test_sku')
    WHERE id = NEW.order_id AND NOT ('test_sku' = ANY(coalesce(tags,'{}')));
  END IF;
  RETURN NEW;
END $function$;
UPDATE public.orders o SET tags = array_append(coalesce(o.tags,'{}'),'test_sku')
WHERE NOT ('test_sku' = ANY(coalesce(o.tags,'{}')))
AND EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id=o.id AND lower(i.sku) IN ('testkrema','testwarbi'));