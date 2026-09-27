CREATE OR REPLACE FUNCTION public.claim_stock_notification()
 RETURNS SETOF stock_notification_events
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  -- Poison guard: a card whose sender was killed 3 times is given up on.
  UPDATE public.stock_notification_events
     SET status = 'failed', claimed_at = NULL,
         last_error = 'Sender stopped repeatedly (timed out) — skipped'
   WHERE status = 'sending' AND claimed_at < now() - interval '45 seconds' AND attempts >= 2;
  RETURN QUERY
  WITH picked AS (
    SELECT e.id FROM public.stock_notification_events e
     WHERE ((e.status IN ('pending','retry') AND e.next_attempt_at <= now())
        OR (e.status = 'sending' AND e.claimed_at < now() - interval '45 seconds'))
     ORDER BY (e.status = 'sending'), e.created_at
     LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.stock_notification_events e
     SET attempts = CASE WHEN e.status = 'sending' THEN e.attempts + 1 ELSE e.attempts END,
         status = 'sending', claimed_at = now()
    FROM picked WHERE e.id = picked.id
  RETURNING e.*;
END;
$function$;
UPDATE public.stock_notification_events SET status='failed', claimed_at=NULL, last_error='Stuck sender — skipped'
 WHERE status='sending' AND created_at < now() - interval '30 minutes';