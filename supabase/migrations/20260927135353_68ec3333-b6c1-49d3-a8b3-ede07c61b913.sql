DO $$
DECLARE j record;
BEGIN
  SELECT jobid, command INTO j FROM cron.job WHERE jobname='qorix-supplier-autosync' AND active LIMIT 1;
  IF j.jobid IS NULL OR position(' as request_id as notify_request_id' IN j.command)=0 THEN
    RAISE EXCEPTION 'Expected schedule version not found';
  END IF;
  PERFORM cron.alter_job(job_id := j.jobid,
    command := replace(j.command, ' as request_id as notify_request_id', ' as notify_request_id'));
END $$;