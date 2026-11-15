CREATE OR REPLACE FUNCTION public.is_test_sku(p_sku text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  select lower(trim(coalesce(p_sku, ''))) in (
    '999999',
    'test1','test2','test3','test4','test5','test6','test7','test8','test9',
    'testkrema','testwarbi','testpowder','testdana','testtaro','testwebo',
    '207','46','252','328/old','323_x','386','136','testfiber'
  );
$$;