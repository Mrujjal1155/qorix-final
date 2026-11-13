CREATE OR REPLACE FUNCTION public.payment_reservation_key(_kind text,_tx text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT CASE WHEN nullif(btrim(_tx),'') IS NULL THEN NULL WHEN _kind='bybit' THEN 'bybit:'||regexp_replace(btrim(_tx),'^bybit:','') WHEN _kind IN ('chain_bep20','chain_trc20') THEN 'chain:'||replace(_kind,'chain_','')||':'||lower(regexp_replace(btrim(_tx),'^chain:(bep20|trc20):','')) WHEN _kind='oxapay' THEN 'oxapay:'||regexp_replace(btrim(_tx),'^(OXA-|oxapay:)','') WHEN _kind='eps' THEN 'eps:'||regexp_replace(btrim(_tx),'^(EPS-|eps:)','') ELSE btrim(_tx) END $$;
REVOKE ALL ON FUNCTION public.payment_reservation_key(text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.payment_reservation_key(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.payment_order_is_paid(_meta jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT coalesce(_meta->>'paid','false')='true' OR coalesce(_meta->>'eps_paid','false')='true' OR coalesce(_meta->>'oxapay_paid','false')='true' OR nullif(_meta->>'paid_at','') IS NOT NULL OR _meta#>>'{binance,status}'='verified' OR _meta#>>'{bybit,status}'='verified' OR _meta#>>'{blockchain,status}'='verified' $$;
REVOKE ALL ON FUNCTION public.payment_order_is_paid(jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.payment_order_is_paid(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.reserve_closed_payment(_kind text,_tx text,_cutoff timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE k text; BEGIN k:=public.payment_reservation_key(_kind,_tx); IF k IS NULL THEN RETURN; END IF; INSERT INTO public.historical_payment_txid_blocks(transaction_key,gateway,cutoff_at,reason) VALUES(k,_kind,_cutoff,'Closed payment attempt; owner requested permanent no-credit reservation') ON CONFLICT(transaction_key) DO NOTHING; END $$;
REVOKE ALL ON FUNCTION public.reserve_closed_payment(text,text,timestamptz) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.reserve_closed_payment(text,text,timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.guard_payment_attempt_deadline() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF TG_OP='INSERT' THEN NEW.expires_at:=least(coalesce(NEW.expires_at,NEW.created_at+interval '30 minutes'),NEW.created_at+interval '30 minutes'); RETURN NEW; END IF;
IF OLD.status='credited' THEN RETURN NEW; END IF;
NEW.expires_at:=least(NEW.expires_at,OLD.expires_at,OLD.created_at+interval '30 minutes');
IF NEW.status='credited' AND (OLD.status<>'pending' OR least(OLD.expires_at,OLD.created_at+interval '30 minutes')<=clock_timestamp()) AND NEW.meta->>'manual_no_credit' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Payment attempt expired; automatic credit forbidden'; END IF;
IF OLD.status IN ('expired','cancelled','failed') AND NEW.status='pending' THEN RAISE EXCEPTION 'Closed payment cannot reopen'; END IF;
IF NEW.status IN ('expired','cancelled','failed') THEN
PERFORM public.reserve_closed_payment(NEW.kind,NEW.tx_id,clock_timestamp());
IF NEW.kind='eps' THEN PERFORM public.reserve_closed_payment('eps',NEW.meta->>'mtid',clock_timestamp()); PERFORM public.reserve_closed_payment('eps',NEW.meta->>'eps_tid',clock_timestamp()); END IF;
IF NEW.kind='oxapay' THEN PERFORM public.reserve_closed_payment('oxapay',NEW.meta->>'track_id',clock_timestamp()); END IF;
END IF; RETURN NEW; END $$;
CREATE TRIGGER payment_attempt_deadline BEFORE INSERT OR UPDATE ON public.binance_deposits FOR EACH ROW EXECUTE FUNCTION public.guard_payment_attempt_deadline();
CREATE OR REPLACE FUNCTION public.guard_website_payment_deadline() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE k text; BEGIN
IF NEW.source<>'website' OR public.payment_order_is_paid(OLD.meta) IS TRUE THEN RETURN NEW; END IF;
IF public.payment_order_is_paid(NEW.meta) IS TRUE AND (OLD.status IN ('expired','cancelled','failed','refunded') OR OLD.created_at+interval '30 minutes'<=clock_timestamp()) THEN RAISE EXCEPTION 'Website payment expired; automatic settlement forbidden'; END IF;
IF NEW.status IN ('expired','cancelled','failed') THEN
k:=CASE WHEN NEW.payment_method='binance' THEN 'payid' WHEN NEW.payment_method LIKE 'usdt%' THEN 'crypto' ELSE NEW.payment_method END;
PERFORM public.reserve_closed_payment(k,NEW.txid,clock_timestamp());
IF k='eps' THEN PERFORM public.reserve_closed_payment('eps',NEW.meta->>'eps_transaction_id',clock_timestamp()); END IF;
IF k='oxapay' THEN PERFORM public.reserve_closed_payment('oxapay',NEW.meta->>'oxapay_track_id',clock_timestamp()); END IF;
END IF; RETURN NEW; END $$;
CREATE TRIGGER website_payment_deadline BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_website_payment_deadline();
CREATE OR REPLACE FUNCTION public.guard_closed_payment_credit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF TG_TABLE_NAME='transactions' AND NEW.type<>'deposit' THEN RETURN NEW; END IF;
IF TG_TABLE_NAME='reseller_transactions' AND NEW.type<>'topup' THEN RETURN NEW; END IF;
IF NEW.reference IS NOT NULL AND EXISTS(SELECT 1 FROM public.historical_payment_txid_blocks b WHERE lower(b.transaction_key)=lower(NEW.reference) OR lower(b.transaction_key)=lower(public.payment_reservation_key(b.gateway,NEW.reference))) THEN RAISE EXCEPTION 'Closed payment transaction cannot credit again' USING ERRCODE='23505'; END IF;
RETURN NEW; END $$;
CREATE TRIGGER closed_payment_bot_credit BEFORE INSERT ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.guard_closed_payment_credit();
CREATE TRIGGER closed_payment_reseller_credit BEFORE INSERT ON public.reseller_transactions FOR EACH ROW EXECUTE FUNCTION public.guard_closed_payment_credit();
CREATE OR REPLACE FUNCTION public.expire_payment_attempts() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE d record; n integer:=0; c integer; BEGIN
FOR d IN SELECT b.id FROM public.binance_deposits b WHERE b.status='pending' AND least(b.expires_at,b.created_at+interval '30 minutes')<=clock_timestamp() ORDER BY b.id LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
UPDATE public.binance_deposits SET status='expired',meta=meta||jsonb_build_object('expired_at',clock_timestamp(),'expiry_reason','30-minute payment deadline') WHERE id=d.id AND status='pending'; n:=n+1;
UPDATE public.orders SET status='cancelled' WHERE meta->>'deposit_id'=d.id::text AND status='awaiting_payment' AND public.payment_order_is_paid(meta) IS NOT TRUE;
END LOOP;
UPDATE public.orders SET status='expired' WHERE source='website' AND status IN ('pending','awaiting_payment') AND created_at+interval '30 minutes'<=clock_timestamp() AND public.payment_order_is_paid(meta) IS NOT TRUE AND payment_method IN ('binance','bybit','chain_bep20','chain_trc20','usdt_BSC','usdt_TRX','eps','oxapay','paykori'); GET DIAGNOSTICS c=ROW_COUNT; n:=n+c;
UPDATE public.payment_requests SET status='expired',admin_note='30-minute deadline; automatic credit disabled' WHERE status='pending' AND created_at+interval '30 minutes'<=clock_timestamp();
RETURN n; END $$;
REVOKE ALL ON FUNCTION public.expire_payment_attempts() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.expire_payment_attempts() TO service_role;