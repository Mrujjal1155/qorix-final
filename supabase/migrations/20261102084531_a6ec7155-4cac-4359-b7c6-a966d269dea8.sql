
CREATE OR REPLACE FUNCTION public.sync_unified_balance_botuser()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d numeric;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  d := coalesce(NEW.balance,0) - coalesce(OLD.balance,0);
  IF d <> 0 THEN
    UPDATE public.resellers SET balance = balance + d WHERE telegram_id = NEW.telegram_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_unified_balance_reseller()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d numeric;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.telegram_id IS NOT NULL AND NEW.telegram_id IS NOT DISTINCT FROM OLD.telegram_id THEN
    d := coalesce(NEW.balance,0) - coalesce(OLD.balance,0);
    IF d <> 0 THEN
      UPDATE public.bot_users SET balance = balance + d WHERE telegram_id = NEW.telegram_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- link change: merge new wallet into reseller, clear old wallet copy
CREATE OR REPLACE FUNCTION public.unified_balance_relink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w numeric;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.telegram_id IS DISTINCT FROM OLD.telegram_id THEN
    IF OLD.telegram_id IS NOT NULL THEN
      UPDATE public.bot_users SET balance = 0 WHERE telegram_id = OLD.telegram_id;
    END IF;
    IF NEW.telegram_id IS NOT NULL THEN
      SELECT balance INTO w FROM public.bot_users WHERE telegram_id = NEW.telegram_id FOR UPDATE;
      NEW.balance := coalesce(NEW.balance,0) + coalesce(w,0);
      UPDATE public.bot_users SET balance = NEW.balance WHERE telegram_id = NEW.telegram_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.sync_unified_balance_botuser() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_unified_balance_reseller() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unified_balance_relink() FROM PUBLIC, anon, authenticated;

-- one-time merge
WITH m AS (
  SELECT r.id, r.telegram_id, r.balance rb, b.balance bb
  FROM public.resellers r JOIN public.bot_users b ON b.telegram_id = r.telegram_id
  FOR UPDATE OF r, b
), ur AS (
  UPDATE public.resellers r SET balance = m.rb + m.bb FROM m WHERE r.id = m.id RETURNING r.id
), ub AS (
  UPDATE public.bot_users b SET balance = m.rb + m.bb FROM m WHERE b.telegram_id = m.telegram_id RETURNING b.telegram_id
), lr AS (
  INSERT INTO public.reseller_transactions (reseller_id, type, amount, balance_after, reference, note)
  SELECT id, 'adjust', bb, rb + bb, 'balance-merge', 'Bot wallet merged into API balance' FROM m WHERE bb <> 0 RETURNING 1
)
INSERT INTO public.transactions (telegram_id, type, amount, method, status, reference, note)
SELECT telegram_id, 'admin', rb, 'balance', 'completed', 'balance-merge', 'API balance merged into bot wallet' FROM m WHERE rb <> 0;

CREATE TRIGGER trg_unified_balance_botuser AFTER UPDATE OF balance ON public.bot_users
FOR EACH ROW EXECUTE FUNCTION public.sync_unified_balance_botuser();
CREATE TRIGGER trg_unified_balance_reseller AFTER UPDATE OF balance ON public.resellers
FOR EACH ROW EXECUTE FUNCTION public.sync_unified_balance_reseller();
CREATE TRIGGER trg_unified_balance_relink BEFORE UPDATE OF telegram_id ON public.resellers
FOR EACH ROW EXECUTE FUNCTION public.unified_balance_relink();
