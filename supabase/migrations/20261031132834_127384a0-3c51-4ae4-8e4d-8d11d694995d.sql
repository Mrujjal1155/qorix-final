CREATE OR REPLACE FUNCTION public.guard_bybit_settings() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF NEW.key IN ('bybit_api_key','bybit_api_secret') THEN RAISE EXCEPTION 'Use secure project secrets'; END IF;
IF NEW.key='bybit_api_verified' AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server verification required' USING ERRCODE='42501'; END IF;
RETURN NEW; END $$;
INSERT INTO public.bot_settings(key,value) VALUES('bybit_enabled','0'),('bybit_api_verified','0'),('bybit_uid','') ON CONFLICT(key) DO NOTHING;
CREATE TRIGGER guard_bybit_settings BEFORE INSERT OR UPDATE ON public.bot_settings FOR EACH ROW EXECUTE FUNCTION public.guard_bybit_settings();
CREATE OR REPLACE FUNCTION public.settle_bybit_bot(_deposit_id uuid,_txid text,_amount numeric,_deliverable boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.binance_deposits%ROWTYPE; new_balance numeric; tx_key text; result jsonb;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
SELECT * INTO d FROM public.binance_deposits WHERE id=_deposit_id FOR UPDATE;
IF NOT FOUND OR d.kind<>'bybit' OR d.telegram_id<=0 OR d.meta ? 'reseller_id' THEN RAISE EXCEPTION 'Invalid Bybit deposit'; END IF;
IF d.status='credited' THEN RETURN jsonb_build_object('changed',false,'status','already_settled'); END IF;
IF d.status NOT IN ('pending','expired') OR _amount IS NULL OR _amount<=0 OR _amount<>d.amount_usdt OR _txid !~ '^[A-Za-z0-9_-]{6,128}$' THEN RAISE EXCEPTION 'Invalid Bybit payment'; END IF;
IF d.tx_id IS DISTINCT FROM _txid THEN RAISE EXCEPTION 'Payment ID changed; retry verification'; END IF;
tx_key:='bybit:'||_txid;
IF jsonb_typeof(d.meta->'items')='array' AND jsonb_array_length(d.meta->'items')>0 THEN
result:=public.settle_bot_checkout(_deposit_id,tx_key,_amount,'bybit',_deliverable);
RETURN result;
END IF;
PERFORM telegram_id FROM public.bot_users WHERE telegram_id=d.telegram_id FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
INSERT INTO public.binance_used_txs(tx_id) VALUES(tx_key);
UPDATE public.bot_users SET balance=balance+round(_amount,2) WHERE telegram_id=d.telegram_id RETURNING balance INTO new_balance;
INSERT INTO public.transactions(telegram_id,type,amount,method,reference,note) VALUES(d.telegram_id,'deposit',round(_amount,2),'bybit',tx_key,'Verified Bybit internal USDT deposit');
INSERT INTO public.payment_requests(telegram_id,method,amount,txid,status,admin_note) VALUES(d.telegram_id,'Bybit Pay',_amount,_txid,'approved','Verified Bybit internal deposit');
UPDATE public.binance_deposits SET status='credited',tx_id=tx_key,meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('settled_at',now()) WHERE id=d.id;
RETURN jsonb_build_object('changed',true,'status','wallet','balance',new_balance);
END $$;
REVOKE ALL ON FUNCTION public.settle_bybit_bot(uuid,text,numeric,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_bybit_bot(uuid,text,numeric,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.settle_bybit_website(_order_id uuid,_txid text,_amount numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
IF NOT FOUND OR o.source<>'website' OR o.payment_method<>'bybit' OR o.reseller_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid Bybit order'; END IF;
IF coalesce((o.meta->>'paid')::boolean,false) THEN RETURN jsonb_build_object('changed',false,'status','already_settled'); END IF;
IF o.status<>'pending' OR o.txid IS DISTINCT FROM _txid OR _txid !~ '^[A-Za-z0-9_-]{6,128}$' OR _amount IS NULL OR _amount<=0 OR _amount<>o.total THEN RAISE EXCEPTION 'Invalid Bybit payment'; END IF;
INSERT INTO public.binance_used_txs(tx_id) VALUES('bybit:'||_txid);
UPDATE public.orders SET meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('paid',true,'paid_at',now(),'awaiting_payment',false,'bybit',jsonb_build_object('status','verified','checked_at',now(),'amount',_amount,'currency','USDT')) WHERE id=o.id;
RETURN jsonb_build_object('changed',true,'status','ready');
END $$;
REVOKE ALL ON FUNCTION public.settle_bybit_website(uuid,text,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_bybit_website(uuid,text,numeric) TO service_role;