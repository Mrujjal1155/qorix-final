ALTER TABLE public.bot_browser_payments DROP CONSTRAINT bot_browser_payments_status_check;
ALTER TABLE public.bot_browser_payments ADD CONSTRAINT bot_browser_payments_status_check CHECK(status IN ('ready','starting','pending','cancelled','expired','completed'));
CREATE FUNCTION public.complete_browser_payment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.status='credited' AND OLD.status IS DISTINCT FROM 'credited' AND NEW.meta->>'browser_link_id' IS NOT NULL THEN UPDATE public.bot_browser_payments SET status='completed' WHERE id=(NEW.meta->>'browser_link_id')::uuid AND deposit_id=NEW.id; END IF;
RETURN NEW; END $$;
CREATE TRIGGER complete_browser_payment AFTER UPDATE OF status ON public.binance_deposits FOR EACH ROW EXECUTE FUNCTION public.complete_browser_payment();
REVOKE ALL ON FUNCTION public.complete_browser_payment() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_browser_payment() TO service_role;