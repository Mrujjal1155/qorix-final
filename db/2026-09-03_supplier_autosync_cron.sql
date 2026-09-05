-- Supplier auto-sync scheduler
--
-- Problem: supplier catalogue sync (and therefore the Telegram bot / channel
-- "new product" + "back in stock" notifications) only runs when *something*
-- hits the app: an admin page load, a shop page load, or a Telegram update.
-- With no traffic there is no server running, so nothing syncs.
--
-- Fix: let Supabase itself ping the public sync endpoint every minute using
-- pg_cron + pg_net. The endpoint is throttled internally by the
-- `supplier_sync_minutes` setting, so pinging often is safe.
--
-- HOW TO RUN
-- 1) Supabase Dashboard -> Database -> Extensions -> enable `pg_cron` and `pg_net`
--    (or just run STEP 1 below; it does the same thing).
-- 2) Run STEP 2 in the SQL Editor.
-- Note: `cron.job` does NOT exist until pg_cron is enabled. If you get
-- ERROR 42P01 relation "cron.job" does not exist, STEP 1 has not run yet.

-- ============ STEP 1: enable extensions ============
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ============ STEP 2: (re)create the schedule ============
do $$
begin
  if exists (select 1 from cron.job where jobname = 'qorix-supplier-autosync') then
    perform cron.unschedule('qorix-supplier-autosync');
  end if;
end
$$;

select cron.schedule(
  'qorix-supplier-autosync',
  '15 seconds', -- pg_cron >= 1.5; endpoint throttles via `supplier_sync_minutes` (0.25 = 15s)
  $$
  select net.http_post(
    url     := 'https://qorixlab.com/api/public/suppliers/sync',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb,
    timeout_milliseconds := 28000
  );
  $$
);

-- Verify:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time
--     from cron.job_run_details order by start_time desc limit 10;
