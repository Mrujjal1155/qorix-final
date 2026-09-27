CREATE OR REPLACE FUNCTION public.claim_stock_notification()
RETURNS SETOF public.stock_notification_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  -- A stopped worker is not evidence that Telegram rejected a message.
  -- Preserve delivery progress, retry later, and never permanently poison an event.
  UPDATE public.stock_notification_events
     SET status = 'retry', claimed_at = NULL,
         next_attempt_at = now(),
         last_error = 'Sender interrupted; retrying undelivered destinations'
   WHERE status = 'sending' AND claimed_at < now() - interval '60 seconds';
  RETURN QUERY
  WITH picked AS (
    SELECT e.id FROM public.stock_notification_events e
     WHERE e.status IN ('pending', 'retry') AND e.next_attempt_at <= now()
     ORDER BY e.next_attempt_at, e.created_at
     LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.stock_notification_events e
     SET status = 'sending', claimed_at = now()
    FROM picked WHERE e.id = picked.id
  RETURNING e.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_stock_notification() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stock_notification() TO service_role;

CREATE OR REPLACE FUNCTION public.finish_stock_notification(_id uuid, _delivered boolean, _error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.stock_notification_events
     SET status = CASE WHEN _delivered THEN 'delivered' ELSE 'retry' END,
         attempts = CASE WHEN _delivered THEN attempts ELSE attempts + 1 END,
         next_attempt_at = CASE WHEN _delivered THEN next_attempt_at
           ELSE now() + least(interval '5 minutes', interval '15 seconds' * power(2, least(5, greatest(0, attempts)))) END,
         claimed_at = NULL,
         delivered_at = CASE WHEN _delivered THEN now() ELSE delivered_at END,
         last_error = CASE WHEN _delivered THEN NULL ELSE left(coalesce(_error, 'Delivery failed'), 500) END
   WHERE id = _id AND status = 'sending';
END;
$$;
REVOKE ALL ON FUNCTION public.finish_stock_notification(uuid, boolean, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_stock_notification(uuid, boolean, text) TO service_role;

UPDATE public.stock_notification_events
   SET status = 'retry', next_attempt_at = now(), claimed_at = NULL, attempts = 0,
       last_error = 'Recovering previously interrupted alert'
 WHERE status = 'failed' AND created_at >= now() - interval '2 hours'
   AND last_error = 'Stuck sender — skipped';