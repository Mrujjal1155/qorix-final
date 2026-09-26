-- lovable-cron-fallback-reviewed: existing live 15s supplier stock poll (suppliers have no webhooks); only adding auth header, cadence unchanged
INSERT INTO public.bot_settings(key, value)
VALUES ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE s text;
BEGIN
  SELECT value INTO s FROM public.bot_settings WHERE key = 'cron_secret';
  PERFORM cron.unschedule('qorix-supplier-autosync');
  PERFORM cron.schedule(
    'qorix-supplier-autosync',
    '15 seconds',
    format($c$select net.http_post(url:='https://qorixlab.com/api/public/suppliers/sync', headers:=%L::jsonb, body:='{}'::jsonb, timeout_milliseconds:=28000) as request_id$c$,
      json_build_object('Content-Type','application/json','x-cron-secret', s)::text)
  );
END $$;