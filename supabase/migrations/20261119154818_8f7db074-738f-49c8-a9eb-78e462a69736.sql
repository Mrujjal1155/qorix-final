CREATE OR REPLACE FUNCTION public.settle_stars_deposit(_deposit_id uuid, _charge_id text, _stars integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.binance_deposits%ROWTYPE; ref text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(_charge_id),'') IS NULL OR _stars IS NULL OR _stars<=0 THEN RAISE EXCEPTION 'Invalid payment'; END IF;
 ref := 'stars:'||btrim(_charge_id);
 SELECT * INTO d FROM public.binance_deposits WHERE id=_deposit_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
 IF d.status='credited' THEN RETURN jsonb_build_object('changed',false,'status','already_settled'); END IF;
 IF d.kind<>'stars' OR jsonb_typeof(d.meta->'items')='array' OR d.status<>'pending' THEN RAISE EXCEPTION 'Not a Stars wallet deposit'; END IF;
 IF coalesce((d.meta->>'stars')::integer,0)<>_stars THEN RAISE EXCEPTION 'Stars amount mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM public.transactions WHERE reference=ref AND type='deposit') THEN RAISE EXCEPTION 'Payment already credited'; END IF;
 UPDATE public.bot_users SET balance=balance+d.amount_usdt WHERE telegram_id=d.telegram_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer not found'; END IF;
 INSERT INTO public.transactions(telegram_id,type,amount,method,reference,note) VALUES(d.telegram_id,'deposit',d.amount_usdt,'stars',ref,_stars||' Telegram Stars');
 UPDATE public.binance_deposits SET status='credited',tx_id=ref,meta=meta||jsonb_build_object('settled_at',now()) WHERE id=_deposit_id;
 RETURN jsonb_build_object('changed',true,'status','credited','amount',d.amount_usdt);
END $$;
REVOKE ALL ON FUNCTION public.settle_stars_deposit(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_stars_deposit(uuid,text,integer) TO service_role;