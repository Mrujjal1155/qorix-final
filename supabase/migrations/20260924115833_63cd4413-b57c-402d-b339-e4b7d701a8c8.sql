ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS api_price numeric,
  ADD COLUMN IF NOT EXISTS flash_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS flash_regular_price numeric,
  ADD COLUMN IF NOT EXISTS flash_discount numeric,
  ADD COLUMN IF NOT EXISTS flash_saved_old_price numeric;

CREATE OR REPLACE FUNCTION public.enqueue_stock_notification(_event_key text, _product_id uuid, _kind text, _source text, _added_qty integer DEFAULT 0, _stock integer DEFAULT 0, _old_price numeric DEFAULT NULL::numeric, _new_price numeric DEFAULT NULL::numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE event_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _kind NOT IN ('restock', 'low', 'out', 'new', 'price', 'flash', 'flash_end') THEN
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
$function$;