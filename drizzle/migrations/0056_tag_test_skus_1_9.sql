CREATE OR REPLACE FUNCTION public.tag_test_sku_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sku = '999999' OR lower(NEW.sku) IN ('test1','test2','test3','test4','test5','test6','test7','test8','test9') THEN
    UPDATE public.orders SET tags = array_append(coalesce(tags,'{}'), 'test_sku')
    WHERE id = NEW.order_id AND NOT ('test_sku' = ANY(coalesce(tags,'{}')));
  END IF;
  RETURN NEW;
END $$;