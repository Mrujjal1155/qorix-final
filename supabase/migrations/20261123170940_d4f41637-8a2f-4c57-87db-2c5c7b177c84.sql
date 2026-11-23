CREATE OR REPLACE FUNCTION public.checkpoint_stock_notification_recipients(_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
WITH x AS (
  SELECT (r->>'event_id')::uuid event_id, (r->>'telegram_id')::bigint telegram_id, r->>'status' status,
         NULLIF(r->>'next_attempt_at','')::timestamptz next_attempt_at, r->>'last_error' last_error,
         NULLIF(r->>'product_id','') product_id
  FROM jsonb_array_elements(_rows) r
  WHERE r->>'status' IN ('sent','retry','unreachable','pending')
), u AS (
  UPDATE public.stock_notification_recipients t SET status=x.status, claimed_at=NULL,
    next_attempt_at=COALESCE(x.next_attempt_at, t.next_attempt_at), last_error=x.last_error,
    attempts=CASE WHEN x.status='pending' THEN GREATEST(t.attempts-1,0) ELSE t.attempts END
  FROM x WHERE t.event_id=x.event_id AND t.telegram_id=x.telegram_id AND t.status='sending'
  RETURNING t.telegram_id, x.status, x.product_id
), a AS (
  UPDATE public.stock_alerts s SET notified_at=now() FROM u
  WHERE u.status='sent' AND u.product_id IS NOT NULL AND s.telegram_id=u.telegram_id
    AND s.product_id::text=u.product_id AND s.notified_at IS NULL
  RETURNING 1
)
SELECT count(*) INTO n FROM u;
RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.checkpoint_stock_notification_recipients(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkpoint_stock_notification_recipients(jsonb) TO service_role;