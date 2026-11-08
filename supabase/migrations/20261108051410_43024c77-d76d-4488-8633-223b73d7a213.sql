CREATE OR REPLACE FUNCTION public.debit_reseller_order(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE o public.orders%ROWTYPE; b numeric; ref text; paid numeric;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND OR o.reseller_id IS NULL OR o.payment_method <> 'reseller_balance' OR o.status <> 'pending' OR coalesce((o.meta->>'refunded')::boolean,false) THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 ref:=coalesce(nullif(o.external_ref,''),o.id::text);
 SELECT balance INTO b FROM public.resellers WHERE id=o.reseller_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 SELECT -sum(amount) INTO paid FROM public.reseller_transactions WHERE reseller_id=o.reseller_id AND reference=ref AND type='order';
 IF paid IS NOT NULL THEN
  IF paid <> o.total THEN RETURN jsonb_build_object('status','ineligible'); END IF;
  UPDATE public.orders SET meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('reseller_owner_rule',true,'paid',true,'debit_amount',paid,'refunded',false) WHERE id=o.id;
  RETURN jsonb_build_object('status','debited','changed',false,'balance',b);
 END IF;
 IF b < o.total THEN RETURN jsonb_build_object('status','insufficient_balance','balance',b,'required',o.total); END IF;
 b:=public.reseller_adjust_balance(o.reseller_id,-o.total,'order',ref,o.quantity::text||'× '||o.product_name);
 UPDATE public.orders SET meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('reseller_owner_rule',true,'paid',true,'debit_amount',o.total,'refunded',false,'debited_at',now()) WHERE id=o.id;
 RETURN jsonb_build_object('status','debited','changed',true,'balance',b);
END $$;
REVOKE ALL ON FUNCTION public.debit_reseller_order(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.debit_reseller_order(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_failed_reseller_order(_order_id uuid,_failure_code text,_supplier_error text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE o public.orders%ROWTYPE; b numeric; ref text; debited numeric; refunded numeric;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _failure_code NOT IN ('out_of_stock','delivery_rejected','delivery_failed') OR _failure_code IS NULL THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND OR o.reseller_id IS NULL OR o.payment_method <> 'reseller_balance' THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 ref:=coalesce(nullif(o.external_ref,''),o.id::text);
 SELECT coalesce(-sum(amount) FILTER (WHERE type='order'),0),coalesce(sum(amount) FILTER (WHERE type='refund'),0) INTO debited,refunded FROM public.reseller_transactions WHERE reseller_id=o.reseller_id AND reference=ref AND type IN ('order','refund');
 IF coalesce((o.meta->>'refunded')::boolean,false) OR refunded>0 THEN RETURN jsonb_build_object('status','already_refunded','changed',false,'refunded',true); END IF;
 IF o.status <> 'pending' OR nullif(btrim(o.delivered_content),'') IS NOT NULL OR o.meta->>'reseller_owner_rule' IS DISTINCT FROM 'true' OR debited<=0 OR debited<>o.total OR coalesce((o.meta->>'debit_amount')::numeric,0)<>debited THEN RETURN jsonb_build_object('status','ineligible','changed',false); END IF;
 b:=public.reseller_adjust_balance(o.reseller_id,debited,'refund',ref,'Refund: delivery failed');
 UPDATE public.orders SET status='failed',delivered_content=NULL,meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('paid',true,'refunded',true,'refund_amount',debited,'refunded_at',now(),'delivery_failure_code',_failure_code)||CASE WHEN _supplier_error IS NOT NULL THEN jsonb_build_object('supplier_failed',true,'supplier_error',left(_supplier_error,500)) ELSE '{}'::jsonb END WHERE id=o.id;
 RETURN jsonb_build_object('status','refunded','changed',true,'refunded',true,'refund_amount',debited,'balance',b);
END $$;
REVOKE ALL ON FUNCTION public.refund_failed_reseller_order(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_failed_reseller_order(uuid,text,text) TO service_role;