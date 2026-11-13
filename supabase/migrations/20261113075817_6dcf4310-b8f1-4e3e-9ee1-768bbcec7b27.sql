CREATE FUNCTION public.manual_payment_reserved(_txid text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
RETURN EXISTS(SELECT 1 FROM public.payment_manual_reconciliations r WHERE EXISTS(SELECT 1 FROM unnest(r.transaction_keys) k WHERE (r.gateway='payid' AND lower(k)=lower(_txid)) OR (r.gateway<>'payid' AND (k=_txid OR k=CASE r.gateway WHEN 'bybit' THEN 'bybit:'||_txid ELSE 'chain:'||replace(r.gateway,'chain_','')||':'||lower(_txid) END)))); END $$;
REVOKE ALL ON FUNCTION public.manual_payment_reserved(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manual_payment_reserved(text) TO authenticated;
CREATE FUNCTION public.guard_manual_deposit_credit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.type='deposit' AND NEW.reference IS NOT NULL AND EXISTS(SELECT 1 FROM public.payment_manual_reconciliations r WHERE EXISTS(SELECT 1 FROM unnest(r.transaction_keys) k WHERE (r.gateway='payid' AND lower(k)=lower(NEW.reference)) OR (r.gateway<>'payid' AND (k=NEW.reference OR k=CASE r.gateway WHEN 'bybit' THEN 'bybit:'||NEW.reference ELSE 'chain:'||replace(r.gateway,'chain_','')||':'||lower(NEW.reference) END)))) THEN RAISE EXCEPTION 'Manually reconciled payment cannot credit again' USING ERRCODE='23505'; END IF;
RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.guard_manual_deposit_credit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_manual_deposit_credit BEFORE INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.guard_manual_deposit_credit();