CREATE TABLE public.stock_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  kind text NOT NULL,
  source text NOT NULL,
  added_qty integer NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  old_price numeric,
  new_price numeric,
  status text NOT NULL DEFAULT 'pending',
  channel_sent boolean NOT NULL DEFAULT false,
  dm_cursor bigint NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_notification_events TO authenticated;
GRANT ALL ON public.stock_notification_events TO service_role;

ALTER TABLE public.stock_notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read stock notification events"
  ON public.stock_notification_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins create stock notification events"
  ON public.stock_notification_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update stock notification events"
  ON public.stock_notification_events FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete stock notification events"
  ON public.stock_notification_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role manages stock notification events"
  ON public.stock_notification_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX stock_notification_events_due_idx
  ON public.stock_notification_events (status, next_attempt_at, created_at);
CREATE INDEX stock_notification_events_product_idx
  ON public.stock_notification_events (product_id, created_at DESC);

CREATE TRIGGER trg_stock_notification_events_updated
  BEFORE UPDATE ON public.stock_notification_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enqueue_stock_notification(
  _event_key text,
  _product_id uuid,
  _kind text,
  _source text,
  _added_qty integer DEFAULT 0,
  _stock integer DEFAULT 0,
  _old_price numeric DEFAULT NULL,
  _new_price numeric DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE event_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _kind NOT IN ('restock', 'low', 'out', 'new', 'price') THEN
    RAISE EXCEPTION 'Invalid stock notification kind';
  END IF;
  INSERT INTO public.stock_notification_events
    (event_key, product_id, kind, source, added_qty, stock, old_price, new_price)
  VALUES
    (_event_key, _product_id, _kind, _source, greatest(0, coalesce(_added_qty, 0)), greatest(0, coalesce(_stock, 0)), _old_price, _new_price)
  ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
  RETURNING id INTO event_id;
  RETURN event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_stock_notification(text, uuid, text, text, integer, integer, numeric, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_stock_notification(text, uuid, text, text, integer, integer, numeric, numeric) TO authenticated, service_role;

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
     WHERE e.status IN ('pending', 'retry')
       AND e.next_attempt_at <= now()
       AND (e.claimed_at IS NULL OR e.claimed_at < now() - interval '45 seconds')
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

CREATE OR REPLACE FUNCTION public.update_stock_notification_progress(
  _id uuid,
  _channel_sent boolean DEFAULT NULL,
  _dm_cursor bigint DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.stock_notification_events
     SET channel_sent = coalesce(_channel_sent, channel_sent),
         dm_cursor = coalesce(_dm_cursor, dm_cursor),
         claimed_at = now()
   WHERE id = _id AND status = 'sending';
END;
$$;
REVOKE ALL ON FUNCTION public.update_stock_notification_progress(uuid, boolean, bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_stock_notification_progress(uuid, boolean, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_stock_notification(
  _id uuid,
  _delivered boolean,
  _error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.stock_notification_events
     SET status = CASE
           WHEN _delivered THEN 'delivered'
           WHEN attempts + 1 >= 8 THEN 'failed'
           ELSE 'retry'
         END,
         attempts = CASE WHEN _delivered THEN attempts ELSE attempts + 1 END,
         next_attempt_at = CASE
           WHEN _delivered THEN next_attempt_at
           ELSE now() + least(interval '15 minutes', interval '30 seconds' * power(2, greatest(0, attempts)))
         END,
         claimed_at = NULL,
         delivered_at = CASE WHEN _delivered THEN now() ELSE delivered_at END,
         last_error = CASE WHEN _delivered THEN NULL ELSE left(coalesce(_error, 'Delivery failed'), 500) END
   WHERE id = _id;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_stock_notification(uuid, boolean, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_stock_notification(uuid, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.retry_latest_stock_notification(_product_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE changed integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.stock_notification_events
     SET status = 'pending', next_attempt_at = now(), claimed_at = NULL, last_error = NULL
   WHERE id = (
     SELECT id FROM public.stock_notification_events
      WHERE product_id = _product_id AND kind = 'restock' AND status IN ('pending', 'retry', 'failed')
      ORDER BY created_at DESC LIMIT 1
   );
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_latest_stock_notification(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.retry_latest_stock_notification(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_stock_items(
  _product_id uuid,
  _qty integer,
  _sold_to bigint DEFAULT NULL
) RETURNS SETOF public.stock_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  before_count integer;
  after_count integer;
  threshold integer;
  claimed_count integer;
  event_kind text;
BEGIN
  SELECT count(*)::integer INTO before_count
    FROM public.stock_items
   WHERE product_id = _product_id AND is_sold = false;

  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.stock_items
     WHERE product_id = _product_id AND is_sold = false
     ORDER BY created_at ASC
     LIMIT greatest(0, _qty)
     FOR UPDATE SKIP LOCKED
  ), changed AS (
    UPDATE public.stock_items s
       SET is_sold = true,
           sold_at = now(),
           sold_to = coalesce(_sold_to, s.sold_to)
      FROM picked
     WHERE s.id = picked.id
    RETURNING s.*
  )
  SELECT * FROM changed;

  GET DIAGNOSTICS claimed_count = ROW_COUNT;
  IF claimed_count <= 0 THEN RETURN; END IF;

  SELECT count(*)::integer INTO after_count
    FROM public.stock_items
   WHERE product_id = _product_id AND is_sold = false;
  SELECT greatest(0, coalesce(nullif(value, '')::integer, 5)) INTO threshold
    FROM public.bot_settings WHERE key = 'announce_low_threshold';
  threshold := coalesce(threshold, 5);

  IF before_count > 0 AND after_count = 0 THEN
    event_kind := 'out';
  ELSIF before_count > threshold AND after_count > 0 AND after_count <= threshold THEN
    event_kind := 'low';
  END IF;

  IF event_kind IS NOT NULL THEN
    INSERT INTO public.stock_notification_events(event_key, product_id, kind, source, stock)
    VALUES (
      event_kind || ':inhouse:' || _product_id::text || ':' || before_count::text || ':' || after_count::text,
      _product_id, event_kind, 'inhouse_sale', after_count
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_stock_items(uuid, integer, bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stock_items(uuid, integer, bigint) TO service_role;