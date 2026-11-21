CREATE TABLE public.website_order_deliveries (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
 telegram_id bigint NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 summary_sent boolean NOT NULL DEFAULT false,
 claim_token uuid,
 claimed_at timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.website_order_deliveries TO service_role;
REVOKE ALL ON public.website_order_deliveries FROM anon, authenticated;
ALTER TABLE public.website_order_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_delivery_access ON public.website_order_deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX website_order_deliveries_pending ON public.website_order_deliveries(next_attempt_at,created_at) WHERE status='pending';
CREATE FUNCTION public.queue_website_order_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.source='website' AND NEW.status='completed' AND NEW.telegram_id > 0 AND NEW.reseller_id IS NULL AND length(trim(coalesce(NEW.delivered_content,'')))>0 THEN
  INSERT INTO public.website_order_deliveries(order_id,telegram_id) VALUES(NEW.id,NEW.telegram_id) ON CONFLICT(order_id) DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.queue_website_order_delivery() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_website_order_delivery() TO service_role;
CREATE TRIGGER queue_website_order_delivery AFTER INSERT OR UPDATE OF status,delivered_content ON public.orders FOR EACH ROW EXECUTE FUNCTION public.queue_website_order_delivery();
CREATE FUNCTION public.claim_website_order_delivery(_order_id uuid DEFAULT NULL) RETURNS SETOF public.website_order_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE public.website_order_deliveries SET status='review',updated_at=now() WHERE status='sending' AND claimed_at < now()-interval '5 minutes';
 RETURN QUERY WITH candidate AS (
  SELECT order_id FROM public.website_order_deliveries WHERE status='pending' AND next_attempt_at<=now() AND (_order_id IS NULL OR order_id=_order_id) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
 ) UPDATE public.website_order_deliveries d SET status='sending',claim_token=gen_random_uuid(),claimed_at=now(),attempts=attempts+1,updated_at=now() FROM candidate c WHERE d.order_id=c.order_id RETURNING d.*;
END; $$;
REVOKE ALL ON FUNCTION public.claim_website_order_delivery(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_website_order_delivery(uuid) TO service_role;