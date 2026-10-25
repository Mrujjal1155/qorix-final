REVOKE ALL ON public.stock_notification_recipients FROM anon,authenticated;
GRANT ALL ON public.stock_notification_recipients TO service_role;