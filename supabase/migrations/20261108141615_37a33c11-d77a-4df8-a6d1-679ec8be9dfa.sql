CREATE OR REPLACE FUNCTION public.enqueue_stock_notification(_event_key text, _product_id uuid, _kind text, _source text, _added_qty integer DEFAULT 0, _stock integer DEFAULT 0, _old_price numeric DEFAULT NULL::numeric, _new_price numeric DEFAULT NULL::numeric)
 RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE event_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _kind NOT IN ('restock', 'low', 'out', 'new', 'price', 'flash', 'flash_end', 'still') THEN
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

-- Admin-triggered "STILL AVAILABLE" alert always reaches every contactable bot customer.
CREATE OR REPLACE FUNCTION public.stock_notification_audience_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.kind = 'still' OR (NEW.kind IN ('new','restock','low','out','removed','price','flash','flash_end') AND coalesce((SELECT customer_alerts_enabled FROM public.products WHERE id=NEW.product_id),(NEW.product_snapshot->>'customer_alerts_enabled')::boolean,false)) THEN
 INSERT INTO public.stock_notification_recipients(event_id,telegram_id) SELECT NEW.id,telegram_id FROM public.bot_users WHERE NOT is_banned AND telegram_id>0 AND contact_status NOT IN ('blocked','deactivated','stopped') ON CONFLICT DO NOTHING;
 END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.stock_notification_audience_trg() FROM PUBLIC,anon,authenticated;