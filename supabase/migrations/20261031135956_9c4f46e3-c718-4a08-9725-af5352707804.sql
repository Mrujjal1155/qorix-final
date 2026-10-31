CREATE TABLE public.blockchain_gateways(network text PRIMARY KEY CHECK(network IN ('trc20','bep20')),address text NOT NULL DEFAULT '',enabled boolean NOT NULL DEFAULT false,verified boolean NOT NULL DEFAULT false,checked_at timestamptz,message text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(NOT enabled OR verified));
GRANT SELECT ON public.blockchain_gateways TO authenticated; GRANT ALL ON public.blockchain_gateways TO service_role;
ALTER TABLE public.blockchain_gateways ENABLE ROW LEVEL SECURITY;
CREATE POLICY blockchain_gateways_admin_read ON public.blockchain_gateways FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
INSERT INTO public.blockchain_gateways(network) VALUES('trc20'),('bep20');
CREATE TABLE public.blockchain_transfers(network text NOT NULL REFERENCES public.blockchain_gateways(network),txid text NOT NULL,sender text NOT NULL,receiver text NOT NULL,amount text NOT NULL,confirmed boolean NOT NULL DEFAULT false,matched boolean NOT NULL DEFAULT false,occurred_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(network,txid));
GRANT SELECT ON public.blockchain_transfers TO authenticated; GRANT ALL ON public.blockchain_transfers TO service_role;
ALTER TABLE public.blockchain_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY blockchain_transfers_admin_read ON public.blockchain_transfers FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.blockchain_touch_updated() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END $$;
CREATE TRIGGER blockchain_gateways_touch BEFORE UPDATE ON public.blockchain_gateways FOR EACH ROW EXECUTE FUNCTION public.blockchain_touch_updated();
CREATE TRIGGER blockchain_transfers_touch BEFORE UPDATE ON public.blockchain_transfers FOR EACH ROW EXECUTE FUNCTION public.blockchain_touch_updated();
CREATE OR REPLACE FUNCTION public.settle_blockchain_bot(_deposit_id uuid,_txid text,_amount numeric,_deliverable boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.binance_deposits%ROWTYPE; new_balance numeric; tx_key text; n text; result jsonb;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
SELECT * INTO d FROM public.binance_deposits WHERE id=_deposit_id FOR UPDATE;
IF NOT FOUND OR d.kind NOT IN ('chain_trc20','chain_bep20') OR d.telegram_id<=0 OR d.meta ? 'reseller_id' THEN RAISE EXCEPTION 'Invalid blockchain deposit';END IF;
IF d.status='credited' THEN RETURN jsonb_build_object('changed',false,'status','already_settled');END IF;
IF d.status<>'pending' OR d.expires_at<=now() OR _amount IS NULL OR _amount<=0 OR _amount<>d.amount_usdt OR _txid !~ '^(0x)?[0-9a-f]{64}$' OR d.tx_id IS DISTINCT FROM _txid THEN RAISE EXCEPTION 'Invalid blockchain payment';END IF;
n:=replace(d.kind,'chain_','');tx_key:='chain:'||n||':'||_txid;
IF NOT EXISTS(SELECT 1 FROM public.blockchain_transfers WHERE network=n AND txid=_txid AND confirmed AND NOT matched AND receiver=d.address AND amount::numeric=_amount AND occurred_at>=d.created_at AND occurred_at<=d.expires_at) THEN RAISE EXCEPTION 'Verified transfer required';END IF;
IF jsonb_typeof(d.meta->'items')='array' AND jsonb_array_length(d.meta->'items')>0 THEN
result:=public.settle_bot_checkout(_deposit_id,tx_key,_amount,d.kind,_deliverable);
ELSE
PERFORM telegram_id FROM public.bot_users WHERE telegram_id=d.telegram_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found';END IF;
INSERT INTO public.binance_used_txs(tx_id) VALUES(tx_key);
UPDATE public.bot_users SET balance=balance+round(_amount,2) WHERE telegram_id=d.telegram_id RETURNING balance INTO new_balance;
INSERT INTO public.transactions(telegram_id,type,amount,method,reference,note) VALUES(d.telegram_id,'deposit',round(_amount,2),d.kind,tx_key,'Verified blockchain USDT');
INSERT INTO public.payment_requests(telegram_id,method,amount,txid,status,admin_note) VALUES(d.telegram_id,d.kind,_amount,_txid,'approved','Verified blockchain USDT');
UPDATE public.binance_deposits SET status='credited',tx_id=tx_key,meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('settled_at',now()) WHERE id=d.id;
result:=jsonb_build_object('changed',true,'status','wallet','balance',new_balance);
END IF;
UPDATE public.blockchain_transfers SET matched=true WHERE network=n AND txid=_txid;
RETURN result;END $$;
REVOKE ALL ON FUNCTION public.settle_blockchain_bot(uuid,text,numeric,boolean) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.settle_blockchain_bot(uuid,text,numeric,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.settle_blockchain_website(_order_id uuid,_txid text,_amount numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE;n text;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
IF NOT FOUND OR o.source<>'website' OR o.payment_method NOT IN ('chain_trc20','chain_bep20') OR o.reseller_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid blockchain order';END IF;
IF coalesce((o.meta->>'paid')::boolean,false) THEN RETURN jsonb_build_object('changed',false,'status','already_settled');END IF;
IF o.status<>'pending' OR o.txid IS DISTINCT FROM _txid OR _txid !~ '^(0x)?[0-9a-f]{64}$' OR _amount IS NULL OR _amount<=0 OR _amount<>o.total THEN RAISE EXCEPTION 'Invalid blockchain payment';END IF;
n:=replace(o.payment_method,'chain_','');
IF NOT EXISTS(SELECT 1 FROM public.blockchain_transfers WHERE network=n AND txid=_txid AND confirmed AND NOT matched AND receiver=o.meta->>'chain_address' AND amount::numeric=_amount AND occurred_at>=o.created_at-interval '30 minutes' AND occurred_at<=o.created_at+interval '30 minutes') THEN RAISE EXCEPTION 'Verified transfer required';END IF;
INSERT INTO public.binance_used_txs(tx_id) VALUES('chain:'||n||':'||_txid);
UPDATE public.orders SET meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('paid',true,'paid_at',now(),'awaiting_payment',false,'blockchain',jsonb_build_object('status','verified','checked_at',now(),'amount',_amount)) WHERE id=o.id;
UPDATE public.blockchain_transfers SET matched=true WHERE network=n AND txid=_txid;
RETURN jsonb_build_object('changed',true,'status','ready');END $$;
REVOKE ALL ON FUNCTION public.settle_blockchain_website(uuid,text,numeric) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.settle_blockchain_website(uuid,text,numeric) TO service_role;
CREATE OR REPLACE FUNCTION public.record_blockchain_website_check(_order_id uuid,_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
UPDATE public.orders SET meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('blockchain',jsonb_build_object('status','not_found','checked_at',now(),'note',left(_note,300))) WHERE id=_order_id AND source='website' AND payment_method IN ('chain_trc20','chain_bep20') AND status='pending' AND NOT coalesce((meta->>'paid')::boolean,false);END $$;
REVOKE ALL ON FUNCTION public.record_blockchain_website_check(uuid,text) FROM PUBLIC,anon,authenticated;GRANT EXECUTE ON FUNCTION public.record_blockchain_website_check(uuid,text) TO service_role;