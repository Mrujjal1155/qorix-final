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
  cycle_id text;
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
  IF claimed_count <= 0 OR claimed_count < greatest(0, _qty) THEN RETURN; END IF;

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
    SELECT coalesce(
             (SELECT e.id::text
                FROM public.stock_notification_events e
               WHERE e.product_id = _product_id AND e.kind = 'restock'
               ORDER BY e.created_at DESC
               LIMIT 1),
             'initial')
      INTO cycle_id;
    INSERT INTO public.stock_notification_events(event_key, product_id, kind, source, stock)
    VALUES (
      event_kind || ':inhouse:' || _product_id::text || ':' || cycle_id,
      _product_id, event_kind, 'inhouse_sale', after_count
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_stock_items(uuid, integer, bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stock_items(uuid, integer, bigint) TO service_role;