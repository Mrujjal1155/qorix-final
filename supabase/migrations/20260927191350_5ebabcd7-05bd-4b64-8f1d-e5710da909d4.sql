CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a int; b int; c int; d int := 0; e int := 0;
BEGIN
  DELETE FROM public.stock_notification_events WHERE status IN ('delivered','failed') AND updated_at < now() - interval '7 days';
  GET DIAGNOSTICS a = ROW_COUNT;
  DELETE FROM public.visibility_alerts WHERE resolved = true AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS b = ROW_COUNT;
  DELETE FROM public.supplier_sync_runs WHERE created_at < now() - interval '3 days';
  GET DIAGNOSTICS c = ROW_COUNT;
  BEGIN
    DELETE FROM cron.job_run_details WHERE end_time < now() - interval '2 days';
    GET DIAGNOSTICS d = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN d := -1; END;
  BEGIN
    DELETE FROM net._http_response WHERE created < now() - interval '1 day';
    GET DIAGNOSTICS e = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN e := -1; END;
  RETURN jsonb_build_object('alerts',a,'visibility',b,'sync_runs',c,'cron_runs',d,'http_logs',e);
END $$;
REVOKE ALL ON FUNCTION public.cleanup_old_logs() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule('qorix-cleanup-logs') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='qorix-cleanup-logs');
  PERFORM cron.schedule('qorix-cleanup-logs', '30 21 * * *', 'SELECT public.cleanup_old_logs()');
END $$;