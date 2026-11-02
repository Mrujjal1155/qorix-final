
CREATE OR REPLACE FUNCTION public.unified_balance_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w numeric;
BEGIN
  IF NEW.telegram_id IS NOT NULL THEN
    SELECT balance INTO w FROM public.bot_users WHERE telegram_id = NEW.telegram_id FOR UPDATE;
    IF w IS NOT NULL THEN
      NEW.balance := coalesce(NEW.balance,0) + w;
      UPDATE public.bot_users SET balance = NEW.balance WHERE telegram_id = NEW.telegram_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.unified_balance_on_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_unified_balance_insert BEFORE INSERT ON public.resellers
FOR EACH ROW EXECUTE FUNCTION public.unified_balance_on_insert();
