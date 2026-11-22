CREATE OR REPLACE FUNCTION public.settle_verified_website_payment(_order_id uuid,_gateway text,_amount numeric,_reference text,_secondary text DEFAULT NULL,_details jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; m jsonb; k text; k2 text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND OR o.source<>'website' OR o.reseller_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid website order'; END IF;
 m:=coalesce(o.meta,'{}'::jsonb);
 IF _gateway='binance' THEN
  IF o.payment_method NOT IN ('binance','usdt_BSC','usdt_TRX','usdt_bep20','usdt_trc20') OR o.txid IS DISTINCT FROM _reference OR _amount IS NULL OR _amount<=0 OR _amount<>o.total THEN RAISE EXCEPTION 'Invalid Binance payment'; END IF;
  k:=_reference;
 ELSIF _gateway='eps' THEN
  IF o.txid IS DISTINCT FROM 'EPS-'||_reference OR _amount IS NULL OR _amount<=0 OR _amount+1<coalesce((m->>'bdt')::numeric,o.total) THEN RAISE EXCEPTION 'Invalid EPS payment'; END IF;
  k:='eps:'||_reference; IF nullif(_secondary,'') IS NOT NULL THEN k2:='eps-tx:'||_secondary; END IF;
 ELSIF _gateway='oxapay' THEN
  IF o.payment_method<>'oxapay' OR m->>'oxapay_track_id' IS DISTINCT FROM _reference OR _amount IS NULL OR _amount<=0 OR round(_amount*100)<round(o.total*100) THEN RAISE EXCEPTION 'Invalid OxaPay payment'; END IF;
  k:='oxapay:'||_reference;
 ELSE RAISE EXCEPTION 'Unsupported website gateway'; END IF;
 IF nullif(btrim(_reference),'') IS NULL THEN RAISE EXCEPTION 'Missing payment reference'; END IF;
 IF public.payment_order_is_paid(m) IS TRUE THEN RETURN jsonb_build_object('changed',false,'status','already_settled'); END IF;
 IF o.status<>'pending' OR o.created_at+interval '30 minutes'<=clock_timestamp() OR coalesce(m->>'refunded','false')='true' THEN RAISE EXCEPTION 'Website payment expired or closed'; END IF;
 INSERT INTO public.binance_used_txs(tx_id) VALUES(k);
 IF k2 IS NOT NULL THEN INSERT INTO public.binance_used_txs(tx_id) VALUES(k2); END IF;
 m:=m||jsonb_build_object('paid',true,'paid_at',clock_timestamp(),'awaiting_payment',false);
 IF _gateway='binance' THEN m:=m||jsonb_build_object('binance',jsonb_build_object('status','verified','amount',_amount,'currency','USDT','checked_at',clock_timestamp()));
 ELSIF _gateway='eps' THEN m:=m||jsonb_build_object('eps_paid',true,'eps_transaction_id',_secondary,'eps_entity',_details->>'entity','paid_bdt',_amount);
 ELSE m:=m||jsonb_build_object('oxapay_paid',true,'oxapay_coin',_details->>'coin','oxapay_tx',_details->>'tx'); END IF;
 UPDATE public.orders SET meta=m,updated_at=clock_timestamp(),payment_method=CASE WHEN _gateway='eps' THEN 'EPS'||CASE WHEN nullif(_details->>'entity','') IS NOT NULL THEN ' · '||(_details->>'entity') ELSE '' END ELSE payment_method END WHERE id=o.id;
 RETURN jsonb_build_object('changed',true,'status','ready');
END $$;
REVOKE ALL ON FUNCTION public.settle_verified_website_payment(uuid,text,numeric,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.settle_verified_website_payment(uuid,text,numeric,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_website_fulfillment(_order_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; p public.products%ROWTYPE; m jsonb; token uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
 m:=coalesce(o.meta,'{}'::jsonb);
 IF o.source<>'website' OR o.reseller_id IS NOT NULL OR o.status<>'pending' OR nullif(btrim(o.delivered_content),'') IS NOT NULL OR public.payment_order_is_paid(m) IS NOT TRUE OR coalesce(m->>'refunded','false')='true' OR coalesce(m->>'awaiting_payment','false')='true' THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 SELECT * INTO p FROM public.products WHERE id=o.product_id FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','missing_product'); END IF;
 m:=m||jsonb_build_object('paid',true,'awaiting_payment',false,'website_fulfillment_checked_at',clock_timestamp());
 UPDATE public.orders SET meta=m,updated_at=clock_timestamp() WHERE id=o.id;
 IF p.delivery_type='manual' THEN
  IF coalesce(m->>'website_manual_reserved','false')='true' THEN RETURN jsonb_build_object('status','manual'); END IF;
  IF NOT public.take_manual_stock(p.id,o.quantity) THEN RETURN jsonb_build_object('status','out_of_stock'); END IF;
  UPDATE public.orders SET meta=m||jsonb_build_object('website_manual_reserved',true),updated_at=clock_timestamp() WHERE id=o.id;
  RETURN jsonb_build_object('status','manual');
 END IF;
 IF p.delivery_type<>'auto' THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 IF p.supplier_id IS NULL THEN RETURN jsonb_build_object('status','inhouse'); END IF;
 IF nullif(p.supplier_external_id,'') IS NULL OR m ? 'website_supplier_attempt' OR m ? 'wallet_supplier_attempt' OR m ? 'supplier_error' OR m ? 'insight_reference' THEN RETURN jsonb_build_object('status','review'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p.supplier_id AND is_enabled) THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 token:=gen_random_uuid();
 UPDATE public.orders SET meta=m||jsonb_build_object('website_supplier_attempt',token,'website_supplier_state','processing','website_supplier_started_at',clock_timestamp()),updated_at=clock_timestamp() WHERE id=o.id;
 RETURN jsonb_build_object('status','supplier','token',token);
END $$;
REVOKE ALL ON FUNCTION public.claim_website_fulfillment(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_website_fulfillment(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.website_fulfillment_candidates(_limit integer DEFAULT 5) RETURNS TABLE(id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT o.id FROM public.orders o JOIN public.products p ON p.id=o.product_id AND p.delivery_type='auto' WHERE auth.role()='service_role' AND o.source='website' AND o.reseller_id IS NULL AND o.status='pending' AND public.payment_order_is_paid(o.meta) IS TRUE AND coalesce(o.meta->>'refunded','false')<>'true' AND coalesce(o.meta->>'awaiting_payment','false')<>'true' AND NOT(coalesce(o.meta,'{}'::jsonb) ?| ARRAY['website_supplier_attempt','wallet_supplier_attempt','website_manual_reserved','supplier_error','insight_reference']) AND nullif(btrim(o.delivered_content),'') IS NULL AND coalesce((o.meta->>'website_fulfillment_checked_at')::timestamptz,'epoch'::timestamptz)<clock_timestamp()-interval '30 seconds' ORDER BY o.created_at LIMIT greatest(1,least(_limit,10));
$$;
REVOKE ALL ON FUNCTION public.website_fulfillment_candidates(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.website_fulfillment_candidates(integer) TO service_role;