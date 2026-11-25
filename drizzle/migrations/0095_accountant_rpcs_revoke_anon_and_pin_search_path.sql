ALTER FUNCTION public.onway_expected_payout_date(date) SET search_path TO 'public';

REVOKE ALL ON FUNCTION public.is_active_accountant(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_accountant_or_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accountant_summary(date, date, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accountant_sales(date, date, text, text, text, text, text, int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accountant_by_sku(date, date, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accountant_export_line_items(date, date, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_active_accountant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_accountant_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accountant_summary(date, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accountant_sales(date, date, text, text, text, text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accountant_by_sku(date, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accountant_export_line_items(date, date, text, text, text) TO authenticated;
