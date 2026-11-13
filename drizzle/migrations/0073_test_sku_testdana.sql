create or replace function public.is_test_sku(p_sku text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(coalesce(p_sku, ''))) in (
    '999999',
    'test1','test2','test3','test4','test5','test6','test7','test8','test9',
    'testkrema','testwarbi','testpowder','testdana',
    '207','46','252','328/old','323_x','386'
  );
$$;