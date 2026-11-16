CREATE OR REPLACE FUNCTION public.expire_payment_attempts()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE d record; n integer:=0; c integer; BEGIN
FOR d IN SELECT b.id FROM public.binance_deposits b WHERE b.status='pending' AND least(b.expires_at,b.created_at+interval '30 minutes')<=clock_timestamp() ORDER BY b.id LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
UPDATE public.binance_deposits SET status='expired',meta=meta||jsonb_build_object('expired_at',clock_timestamp(),'expiry_reason','30-minute payment deadline') WHERE id=d.id AND status='pending'; n:=n+1;
UPDATE public.orders SET status='cancelled' WHERE meta->>'deposit_id'=d.id::text AND status='awaiting_payment' AND public.payment_order_is_paid(meta) IS NOT TRUE;
END LOOP;
UPDATE public.orders SET status='cancelled', meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('expired_at',clock_timestamp(),'expiry_reason','30-minute payment deadline') WHERE source='website' AND status IN ('pending','awaiting_payment') AND created_at+interval '30 minutes'<=clock_timestamp() AND public.payment_order_is_paid(meta) IS NOT TRUE AND payment_method IN ('binance','bybit','chain_bep20','chain_trc20','usdt_BSC','usdt_TRX','eps','oxapay','paykori'); GET DIAGNOSTICS c=ROW_COUNT; n:=n+c;
UPDATE public.payment_requests SET status='expired',admin_note='30-minute deadline; automatic credit disabled' WHERE status='pending' AND created_at+interval '30 minutes'<=clock_timestamp();
RETURN n; END $function$;