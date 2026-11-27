CREATE OR REPLACE FUNCTION public.sync_unified_balance_botuser()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d numeric;
BEGIN
  IF coalesce(current_setting('app.unified_balance_sync', true), '') = '1' THEN RETURN NEW; END IF;
  d := coalesce(NEW.balance,0) - coalesce(OLD.balance,0);
  IF d <> 0 THEN
    PERFORM set_config('app.unified_balance_sync', '1', true);
    BEGIN
      UPDATE public.resellers SET balance = balance + d WHERE telegram_id = NEW.telegram_id;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('app.unified_balance_sync', '', true);
      RAISE;
    END;
    PERFORM set_config('app.unified_balance_sync', '', true);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_unified_balance_reseller()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d numeric;
BEGIN
  IF coalesce(current_setting('app.unified_balance_sync', true), '') = '1' THEN RETURN NEW; END IF;
  IF NEW.telegram_id IS NOT NULL AND NEW.telegram_id IS NOT DISTINCT FROM OLD.telegram_id THEN
    d := coalesce(NEW.balance,0) - coalesce(OLD.balance,0);
    IF d <> 0 THEN
      PERFORM set_config('app.unified_balance_sync', '1', true);
      BEGIN
        UPDATE public.bot_users SET balance = balance + d WHERE telegram_id = NEW.telegram_id;
      EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('app.unified_balance_sync', '', true);
        RAISE;
      END;
      PERFORM set_config('app.unified_balance_sync', '', true);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.unified_balance_relink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w numeric;
BEGIN
  IF coalesce(current_setting('app.unified_balance_sync', true), '') = '1' THEN RETURN NEW; END IF;
  IF NEW.telegram_id IS DISTINCT FROM OLD.telegram_id THEN
    PERFORM set_config('app.unified_balance_sync', '1', true);
    BEGIN
      IF OLD.telegram_id IS NOT NULL THEN
        UPDATE public.bot_users SET balance = 0 WHERE telegram_id = OLD.telegram_id;
      END IF;
      IF NEW.telegram_id IS NOT NULL THEN
        SELECT balance INTO w FROM public.bot_users WHERE telegram_id = NEW.telegram_id FOR UPDATE;
        NEW.balance := coalesce(NEW.balance,0) + coalesce(w,0);
        UPDATE public.bot_users SET balance = NEW.balance WHERE telegram_id = NEW.telegram_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('app.unified_balance_sync', '', true);
      RAISE;
    END;
    PERFORM set_config('app.unified_balance_sync', '', true);
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.sync_unified_balance_botuser() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_unified_balance_reseller() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unified_balance_relink() FROM PUBLIC, anon, authenticated;