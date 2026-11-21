ALTER TABLE public.bot_browser_payments ALTER CONSTRAINT bot_browser_payments_deposit_id_fkey DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION public.attach_browser_deposit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE l public.bot_browser_payments; BEGIN
IF NEW.meta->>'browser_link_id' IS NULL THEN RETURN NEW; END IF;
SELECT * INTO l FROM public.bot_browser_payments WHERE id=(NEW.meta->>'browser_link_id')::uuid FOR UPDATE;
IF l.status IS DISTINCT FROM 'starting' OR l.expires_at<=now() OR NEW.telegram_id IS DISTINCT FROM l.telegram_id OR NEW.amount_usdt IS DISTINCT FROM l.total OR l.deposit_id IS NOT NULL THEN RAISE EXCEPTION 'Browser payment unavailable'; END IF;
NEW.created_at=l.created_at; NEW.expires_at=least(NEW.expires_at,l.expires_at);
UPDATE public.orders SET meta=meta||jsonb_build_object('deposit_id',NEW.id,'gateway',l.gateway) WHERE telegram_id=l.telegram_id AND meta->>'browser_link_id'=l.id::text AND status='awaiting_payment'; IF NOT FOUND THEN RAISE EXCEPTION 'Original orders missing'; END IF;
UPDATE public.bot_browser_payments SET deposit_id=NEW.id,status='pending' WHERE id=l.id;
RETURN NEW; END $$;
CREATE TRIGGER attach_browser_deposit BEFORE INSERT ON public.binance_deposits FOR EACH ROW EXECUTE FUNCTION public.attach_browser_deposit();
CREATE OR REPLACE FUNCTION public.bind_bot_browser_payment(_id uuid,_deposit_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE l public.bot_browser_payments; BEGIN
SELECT * INTO l FROM public.bot_browser_payments WHERE id=_id FOR UPDATE;
IF l.deposit_id IS DISTINCT FROM _deposit_id OR l.status IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'Payment cannot be attached'; END IF; END $$;
REVOKE ALL ON FUNCTION public.attach_browser_deposit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_browser_deposit() TO service_role;