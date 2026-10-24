CREATE OR REPLACE FUNCTION public.settle_bot_checkout(_deposit_id uuid, _txid text, _amount numeric, _method text, _deliverable boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.binance_deposits%ROWTYPE; u public.bot_users%ROWTYPE; total_due numeric; row_count integer; eligible boolean; snapshot jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _amount IS NULL OR _amount<=0 OR nullif(btrim(_txid),'') IS NULL THEN RAISE EXCEPTION 'Invalid payment'; END IF;
 SELECT * INTO d FROM public.binance_deposits WHERE id=_deposit_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
 IF d.status='credited' THEN RETURN jsonb_build_object('changed',false,'status','already_settled'); END IF;
 IF jsonb_typeof(d.meta->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(d.meta->'items')=0 OR d.telegram_id<=0 OR d.meta ? 'reseller_id' THEN RAISE EXCEPTION 'Not a customer checkout'; END IF;
 IF round(_amount,2)<d.amount_usdt THEN RAISE EXCEPTION 'Insufficient payment'; END IF;
 SELECT * INTO u FROM public.bot_users WHERE telegram_id=d.telegram_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
 PERFORM id FROM public.orders WHERE telegram_id=d.telegram_id AND meta->>'deposit_id'=_deposit_id::text ORDER BY id FOR UPDATE;
 SELECT count(*),coalesce(sum(total),0),coalesce(bool_and(status IN ('awaiting_payment','cancelled') AND NOT coalesce((meta->>'paid')::boolean,false)),false),jsonb_agg(to_jsonb(o)) INTO row_count,total_due,eligible,snapshot FROM public.orders o WHERE telegram_id=d.telegram_id AND meta->>'deposit_id'=_deposit_id::text;
 IF row_count=0 OR NOT eligible OR total_due<=0 THEN RAISE EXCEPTION 'Checkout cannot be settled automatically'; END IF;
 IF EXISTS(SELECT 1 FROM public.transactions WHERE reference=_txid AND type='deposit') THEN RAISE EXCEPTION 'Payment already credited'; END IF;
 UPDATE public.bot_users SET balance=balance+round(_amount,2) WHERE telegram_id=d.telegram_id;
 INSERT INTO public.transactions(telegram_id,type,amount,method,reference,note) VALUES(d.telegram_id,'deposit',round(_amount,2),_method,_txid,'Verified checkout payment');
 INSERT INTO public.payment_requests(telegram_id,method,amount,txid,status,admin_note) VALUES(d.telegram_id,_method,round(_amount,2),_txid,'approved','Verified checkout payment');
 eligible := _deliverable AND row_count=jsonb_array_length(d.meta->'items') AND u.balance+round(_amount,2)>=total_due;
 IF eligible THEN
  UPDATE public.bot_users SET balance=balance-total_due,total_spent=total_spent+total_due WHERE telegram_id=d.telegram_id;
  INSERT INTO public.transactions(telegram_id,type,amount,method,reference,note) VALUES(d.telegram_id,'purchase',-total_due,_method,_txid,'Original checkout price');
 END IF;
 UPDATE public.orders SET status=CASE WHEN eligible THEN 'pending' ELSE 'cancelled' END,payment_method=_method,txid=_txid,meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('paid',true,'paid_at',now(),'awaiting_payment',false,'refunded',NOT eligible)||CASE WHEN eligible THEN '{}'::jsonb ELSE jsonb_build_object('refund_amount',total,'refund_reason','Checkout unavailable — payment kept in wallet') END WHERE telegram_id=d.telegram_id AND meta->>'deposit_id'=_deposit_id::text;
 UPDATE public.binance_deposits SET status='credited',tx_id=_txid,meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('settled_at',now(),'checkout_charged',eligible) WHERE id=_deposit_id;
 RETURN jsonb_build_object('changed',true,'status',CASE WHEN eligible THEN 'ready' ELSE 'wallet' END,'total',total_due,'orders',snapshot);
END $$;
REVOKE ALL ON FUNCTION public.settle_bot_checkout(uuid,text,numeric,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_bot_checkout(uuid,text,numeric,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.expire_bot_checkouts(_cutoff timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d record; changed integer:=0; n integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 FOR d IN SELECT b.id,b.status FROM public.binance_deposits b WHERE EXISTS(SELECT 1 FROM public.orders o WHERE o.meta->>'deposit_id'=b.id::text AND o.status='awaiting_payment' AND o.created_at<_cutoff) ORDER BY b.id LIMIT 200 FOR UPDATE OF b SKIP LOCKED LOOP
  IF d.status='credited' THEN CONTINUE; END IF;
  UPDATE public.orders SET status='cancelled' WHERE meta->>'deposit_id'=d.id::text AND status='awaiting_payment' AND created_at<_cutoff AND NOT coalesce((meta->>'paid')::boolean,false);
  GET DIAGNOSTICS n=ROW_COUNT;
  changed:=changed+n;
  IF n>0 THEN UPDATE public.binance_deposits SET status='expired' WHERE id=d.id AND status<>'credited'; END IF;
 END LOOP;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.expire_bot_checkouts(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_bot_checkouts(timestamptz) TO service_role;