-- lovable-cron-fallback-reviewed: user-requested 1-minute safety net for Binance/Bybit deposit verification when the bot receives no updates; reuses existing cron_secret header auth
DO $$
DECLARE s text;
BEGIN
  SELECT value INTO s FROM public.bot_settings WHERE key = 'cron_secret';
  IF s IS NULL OR s = '' THEN
    RAISE EXCEPTION 'cron_secret missing in bot_settings';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'qorix-binance-auto-verify') THEN
    PERFORM cron.unschedule('qorix-binance-auto-verify');
  END IF;
  PERFORM cron.schedule(
    'qorix-binance-auto-verify',
    '* * * * *',
    format($c$select net.http_post(url:='https://qorixlab.com/api/public/binance/auto-verify', headers:=%L::jsonb, body:='{}'::jsonb, timeout_milliseconds:=28000) as request_id$c$,
      json_build_object('Content-Type','application/json','x-cron-secret', s)::text)
  );
END $$;