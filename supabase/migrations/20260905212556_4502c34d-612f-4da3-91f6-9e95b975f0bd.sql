REVOKE EXECUTE ON FUNCTION public.adjust_product_stock(text, text, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_order_confirm_stock(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.apply_order_cancel_stock(uuid, boolean) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.adjust_product_stock(text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_confirm_stock(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_cancel_stock(uuid, boolean) TO authenticated;