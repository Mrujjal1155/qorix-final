CREATE TABLE public.live_update_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  ref text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
GRANT SELECT ON public.live_update_events TO authenticated;
GRANT ALL ON public.live_update_events TO service_role;
ALTER TABLE public.live_update_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read live updates" ON public.live_update_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX live_update_events_pending ON public.live_update_events (created_at) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.live_update_enqueue(_kind text, _ref text, _payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.live_update_events(kind, ref, payload) VALUES (_kind, _ref, _payload) ON CONFLICT (ref) DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL; -- never block the real purchase/top-up
END $$;
REVOKE ALL ON FUNCTION public.live_update_enqueue(text,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.live_update_orders_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text;
BEGIN
  IF NEW.status = 'completed' AND NEW.source IN ('telegram','website')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    IF NEW.source = 'telegram' THEN
      SELECT coalesce(first_name, username) INTO _name FROM bot_users WHERE telegram_id = NEW.telegram_id;
    ELSE _name := NEW.customer_name; END IF;
    PERFORM live_update_enqueue('purchase', 'order:' || NEW.id, jsonb_build_object(
      'uid', CASE WHEN NEW.source='telegram' THEN NEW.telegram_id::text ELSE coalesce(NEW.user_id::text, NEW.order_no::text) END,
      'name', coalesce(_name,''), 'product', NEW.product_name, 'qty', NEW.quantity,
      'method', coalesce(NEW.payment_method,''), 'source', NEW.source));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER live_update_orders AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.live_update_orders_trg();

CREATE OR REPLACE FUNCTION public.live_update_tx_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text;
BEGIN
  IF NEW.type = 'deposit' AND NEW.status = 'completed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    SELECT coalesce(first_name, username) INTO _name FROM bot_users WHERE telegram_id = NEW.telegram_id;
    PERFORM live_update_enqueue('topup', 'tx:' || NEW.id, jsonb_build_object(
      'uid', NEW.telegram_id::text, 'name', coalesce(_name,''), 'method', coalesce(NEW.method,''), 'source','telegram'));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER live_update_tx AFTER INSERT OR UPDATE OF status ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.live_update_tx_trg();

CREATE OR REPLACE FUNCTION public.live_update_wallet_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text;
BEGIN
  IF NEW.type IN ('deposit','topup') AND NEW.amount > 0 THEN
    SELECT full_name INTO _name FROM profiles WHERE id = NEW.user_id;
    PERFORM live_update_enqueue('topup', 'wtx:' || NEW.id, jsonb_build_object(
      'uid', NEW.user_id::text, 'name', coalesce(_name,''), 'method', coalesce(NEW.reference,''), 'source','website'));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER live_update_wallet AFTER INSERT ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.live_update_wallet_trg();

CREATE OR REPLACE FUNCTION public.live_update_botuser_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.telegram_id > 1000000 THEN
    PERFORM live_update_enqueue('member', 'bu:' || NEW.telegram_id, jsonb_build_object(
      'uid', NEW.telegram_id::text, 'name', coalesce(NEW.first_name, NEW.username, ''), 'source','telegram'));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER live_update_botuser AFTER INSERT ON public.bot_users FOR EACH ROW EXECUTE FUNCTION public.live_update_botuser_trg();

CREATE OR REPLACE FUNCTION public.live_update_profile_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM live_update_enqueue('member', 'pf:' || NEW.id, jsonb_build_object(
    'uid', NEW.id::text, 'name', coalesce(NEW.full_name,''), 'source','website'));
  RETURN NEW;
END $$;
CREATE TRIGGER live_update_profile AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.live_update_profile_trg();

REVOKE ALL ON FUNCTION public.live_update_orders_trg(), public.live_update_tx_trg(), public.live_update_wallet_trg(), public.live_update_botuser_trg(), public.live_update_profile_trg() FROM PUBLIC, anon, authenticated;