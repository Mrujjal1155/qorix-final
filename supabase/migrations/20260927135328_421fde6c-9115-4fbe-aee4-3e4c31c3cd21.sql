DO $$
DECLARE j record;
BEGIN
  SELECT jobid, command INTO j FROM cron.job WHERE jobname = 'qorix-supplier-autosync' AND active LIMIT 1;
  IF j.jobid IS NULL OR position('/api/public/suppliers/sync' IN j.command) = 0
     OR position('x-cron-secret' IN j.command) = 0 THEN
    RAISE EXCEPTION 'Existing secured supplier schedule not found';
  END IF;
  PERFORM cron.alter_job(
    job_id := j.jobid,
    command := replace(j.command,
      'select net.http_post(url:=',
      'select net.http_post(url:=' )
  );
  -- Reuse the existing authenticated call and substitute only its endpoint.
  -- Both requests are launched independently in one SQL statement; pg_net
  -- performs the HTTP calls asynchronously so one cannot block the other.
  PERFORM cron.alter_job(
    job_id := j.jobid,
    command := replace(j.command, ' as request_id', ' as sync_request_id, ' ||
      replace(replace(j.command, 'select ', ''), '/api/public/suppliers/sync', '/api/public/suppliers/notify') || ' as notify_request_id')
  );
END $$;