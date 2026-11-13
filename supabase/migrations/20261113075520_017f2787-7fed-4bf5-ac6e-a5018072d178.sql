CREATE FUNCTION public.guard_manual_payment_reuse() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF EXISTS(SELECT 1 FROM public.payment_manual_reconciliations r WHERE (r.gateway='payid' AND EXISTS(SELECT 1 FROM unnest(r.transaction_keys) k WHERE lower(k)=lower(NEW.tx_id))) OR (r.gateway<>'payid' AND NEW.tx_id=ANY(r.transaction_keys))) THEN RAISE EXCEPTION 'Manually reconciled transaction already used' USING ERRCODE='23505'; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.guard_manual_payment_reuse() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_manual_payment_reuse BEFORE INSERT ON public.binance_used_txs FOR EACH ROW EXECUTE FUNCTION public.guard_manual_payment_reuse();
CREATE FUNCTION public.finish_manual_payment_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.reason IS NULL OR length(trim(NEW.reason))<5 OR NEW.transaction_keys IS NULL OR cardinality(NEW.transaction_keys)<1 THEN RAISE EXCEPTION 'Incomplete reconciliation'; END IF;
UPDATE public.payment_requests SET status='manual_reconciled',admin_note='Wallet already credited manually; transaction reserved without additional credit.' WHERE telegram_id=NEW.telegram_id AND status='pending' AND ((NEW.gateway='payid' AND EXISTS(SELECT 1 FROM unnest(NEW.transaction_keys) k WHERE lower(k)=lower(txid))) OR txid=NEW.txid);
RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.finish_manual_payment_receipt() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER finish_manual_payment_receipt AFTER INSERT ON public.payment_manual_reconciliations FOR EACH ROW EXECUTE FUNCTION public.finish_manual_payment_receipt();