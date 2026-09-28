REVOKE ALL ON FUNCTION public.stock_items_counter_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_counter_bump(uuid,integer) FROM PUBLIC, anon, authenticated;