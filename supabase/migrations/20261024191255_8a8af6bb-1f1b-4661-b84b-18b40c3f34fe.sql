-- Reseller API sales (api_bot / api_website) also appear in the live
-- update channel as "New Purchase!" posts. Identity stays masked in the
-- post builder; the trigger only decides WHICH sales are announced.
CREATE OR REPLACE FUNCTION public.live_update_orders_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text;
BEGIN
  IF NEW.status = 'completed' AND NEW.source IN ('telegram','website','api_bot','api_website')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    IF NEW.source = 'telegram' THEN
      SELECT coalesce(first_name, username) INTO _name FROM bot_users WHERE telegram_id = NEW.telegram_id;
    ELSE _name := NEW.customer_name; END IF;
    PERFORM live_update_enqueue('purchase', 'order:' || NEW.id, jsonb_build_object(
      'uid', CASE WHEN NEW.source='telegram' THEN NEW.telegram_id::text
                  ELSE coalesce(NEW.user_id::text, NEW.reseller_id::text, NEW.order_no::text) END,
      'name', coalesce(_name,''), 'product', NEW.product_name, 'qty', NEW.quantity,
      'method', coalesce(NEW.payment_method,''), 'source', NEW.source));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS live_update_orders ON public.orders;
CREATE TRIGGER live_update_orders AFTER INSERT OR UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.live_update_orders_trg();
REVOKE ALL ON FUNCTION public.live_update_orders_trg() FROM PUBLIC, anon, authenticated;