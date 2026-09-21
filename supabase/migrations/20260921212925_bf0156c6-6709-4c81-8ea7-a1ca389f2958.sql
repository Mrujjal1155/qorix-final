CREATE OR REPLACE FUNCTION public.claim_stock_notification()
RETURNS SETOF public.stock_notification_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN QUERY
  WITH picked AS (
    SELECT e.id
      FROM public.stock_notification_events e
     WHERE (
       (e.status IN ('pending', 'retry') AND e.next_attempt_at <= now())
       OR (e.status = 'sending' AND e.claimed_at < now() - interval '45 seconds')
     )
     ORDER BY e.created_at
     LIMIT 1
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.stock_notification_events e
     SET status = 'sending', claimed_at = now()
    FROM picked
   WHERE e.id = picked.id
  RETURNING e.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stock_notification() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stock_notification() TO service_role;