REVOKE ALL ON public.live_update_events FROM anon,authenticated;
GRANT SELECT ON public.live_update_events TO authenticated;
GRANT ALL ON public.live_update_events TO service_role;