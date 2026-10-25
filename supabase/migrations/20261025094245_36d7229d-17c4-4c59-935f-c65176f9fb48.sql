DELETE FROM public.stock_notification_recipients WHERE created_at < timestamptz '2026-10-25 09:41:00+00' AND status IN ('pending','retry','sending');
UPDATE public.stock_notification_events SET status='delivered',claimed_at=NULL,last_error='Cancelled unsent backlog by admin request at 2026-10-25 09:41 UTC' WHERE created_at < timestamptz '2026-10-25 09:41:00+00' AND status IN ('pending','retry','sending','failed');
UPDATE public.bot_settings SET value='[]' WHERE key LIKE 'supplier_notify_queue:%';
CREATE TABLE public.stock_notification_dispatch (id boolean PRIMARY KEY DEFAULT true CHECK(id), next_claim_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.stock_notification_dispatch TO service_role;
ALTER TABLE public.stock_notification_dispatch ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Server manages customer dispatch" ON public.stock_notification_dispatch TO service_role USING(true) WITH CHECK(true);
CREATE TRIGGER stock_dispatch_updated BEFORE UPDATE ON public.stock_notification_dispatch FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.stock_notification_dispatch(id) VALUES(true);
CREATE FUNCTION public.claim_stock_notification_recipients_fast() RETURNS TABLE(event_id uuid,telegram_id bigint,message jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
PERFORM 1 FROM public.stock_notification_dispatch WHERE id=true AND next_claim_at<=now() FOR UPDATE SKIP LOCKED;
IF NOT FOUND THEN RETURN; END IF;
UPDATE public.stock_notification_dispatch SET next_claim_at=now()+interval '15 seconds' WHERE id=true;
RETURN QUERY WITH picked AS (
 SELECT r.event_id,r.telegram_id FROM public.stock_notification_recipients r JOIN public.stock_notification_events e ON e.id=r.event_id
 WHERE e.audience_message IS NOT NULL AND ((r.status IN ('pending','retry') AND r.next_attempt_at<=now()) OR (r.status='sending' AND r.claimed_at<now()-interval '60 seconds'))
 ORDER BY r.next_attempt_at,r.created_at,r.telegram_id LIMIT 120 FOR UPDATE OF r SKIP LOCKED
), updated AS (UPDATE public.stock_notification_recipients r SET status='sending',claimed_at=now(),attempts=r.attempts+1 FROM picked p WHERE r.event_id=p.event_id AND r.telegram_id=p.telegram_id RETURNING r.event_id,r.telegram_id)
 SELECT u.event_id,u.telegram_id,e.audience_message FROM updated u JOIN public.stock_notification_events e ON e.id=u.event_id;
END $$;
REVOKE ALL ON public.stock_notification_dispatch FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_stock_notification_recipients_fast() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stock_notification_recipients_fast() TO service_role;