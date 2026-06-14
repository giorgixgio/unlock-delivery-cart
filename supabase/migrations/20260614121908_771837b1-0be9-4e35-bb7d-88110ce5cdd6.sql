GRANT INSERT ON public.stockout_attempts TO anon, authenticated;
GRANT SELECT, UPDATE ON public.stockout_attempts TO authenticated;
GRANT ALL ON public.stockout_attempts TO service_role;
GRANT EXECUTE ON FUNCTION public.record_stockout_attempt(uuid, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_stockout_waitlist(uuid) TO anon, authenticated, service_role;