CREATE OR REPLACE FUNCTION public.is_test_sku(p_sku text)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT lower(trim(coalesce(p_sku,''))) IN ('999999','test1','test2','test3','test4','test5','test6','test7','test8','test9','testkrema','testwarbi','207','46','252')
$function$;