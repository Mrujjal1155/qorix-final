CREATE OR REPLACE FUNCTION public.settle_payment_wallet(_deposit_id uuid,_txid text,_amount numeric,_method text,_note text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE d public.binance_deposits%ROWTYPE; k text; b numeric; BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
SELECT * INTO d FROM public.binance_deposits WHERE id=_deposit_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
IF d.status='credited' THEN RETURN jsonb_build_object('changed',false,'status','already_settled'); END IF;
IF d.status<>'pending' OR least(d.expires_at,d.created_at+interval '30 minutes')<=clock_timestamp() THEN RAISE EXCEPTION 'Payment attempt expired'; END IF;
IF _amount IS NULL OR _amount<>d.amount_usdt OR _amount<=0 OR nullif(btrim(_txid),'') IS NULL THEN RAISE EXCEPTION 'Invalid payment'; END IF;
IF d.kind NOT IN ('payid','crypto','eps','oxapay') OR (jsonb_typeof(d.meta->'items')='array' AND jsonb_array_length(d.meta->'items')>0 AND NOT d.meta ? 'reseller_id') THEN RAISE EXCEPTION 'Unsupported wallet payment'; END IF;
k:=public.payment_reservation_key(d.kind,CASE WHEN d.kind='oxapay' THEN d.meta->>'track_id' ELSE _txid END);
INSERT INTO public.binance_used_txs(tx_id) VALUES(k);
IF d.kind='eps' AND nullif(d.meta->>'mtid','') IS NOT NULL AND public.payment_reservation_key('eps',d.meta->>'mtid')<>k THEN INSERT INTO public.binance_used_txs(tx_id) VALUES(public.payment_reservation_key('eps',d.meta->>'mtid')); END IF;
IF d.meta ? 'reseller_id' THEN
b:=public.reseller_adjust_balance((d.meta->>'reseller_id')::uuid,_amount,'topup',_txid,_note);
INSERT INTO public.reseller_topups(reseller_id,amount,method,txid,status,admin_note) VALUES((d.meta->>'reseller_id')::uuid,_amount,_method,_txid,'approved',_note);
ELSE
PERFORM public.bot_user_credit(d.telegram_id,_amount,'deposit',_method,_txid,_note);
SELECT balance INTO b FROM public.bot_users WHERE telegram_id=d.telegram_id;
INSERT INTO public.payment_requests(telegram_id,method,amount,txid,status,admin_note) VALUES(d.telegram_id,_method,_amount,_txid,'approved',_note);
END IF;
UPDATE public.binance_deposits SET status='credited',tx_id=_txid,meta=meta||jsonb_build_object('settled_at',clock_timestamp()) WHERE id=d.id;
RETURN jsonb_build_object('changed',true,'status','wallet','balance',b); END $$;
REVOKE ALL ON FUNCTION public.settle_payment_wallet(uuid,text,numeric,text,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.settle_payment_wallet(uuid,text,numeric,text,text) TO service_role;