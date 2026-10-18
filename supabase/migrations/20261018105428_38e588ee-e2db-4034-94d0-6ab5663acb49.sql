CREATE OR REPLACE FUNCTION public.fulfill_charged_reseller_stock(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE o public.orders%ROWTYPE; p public.products%ROWTYPE; contents text[]; claimed_count integer; ref text; net_paid numeric;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
 IF o.status='completed' THEN RETURN jsonb_build_object('status','completed','changed',false); END IF;
 IF o.status <> 'pending' OR o.reseller_id IS NULL OR o.payment_method <> 'reseller_balance' OR nullif(btrim(o.delivered_content),'') IS NOT NULL OR coalesce((o.meta->>'refunded')::boolean,false) THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 SELECT * INTO p FROM public.products WHERE id=o.product_id;
 IF NOT FOUND OR p.delivery_type <> 'auto' OR p.supplier_id IS NOT NULL OR o.quantity < 1 THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 ref := coalesce(nullif(o.external_ref,''),o.id::text);
 SELECT -coalesce(sum(amount),0) INTO net_paid FROM public.reseller_transactions WHERE reseller_id=o.reseller_id AND reference=ref AND type IN ('order','refund');
 IF NOT EXISTS(SELECT 1 FROM public.reseller_transactions WHERE reseller_id=o.reseller_id AND reference=ref AND type='order') OR net_paid < o.total THEN RETURN jsonb_build_object('status','not_charged'); END IF;
 BEGIN
  SELECT array_agg(s.content),count(*)::integer INTO contents,claimed_count FROM public.claim_stock_items(o.product_id,o.quantity,NULL) s;
  IF claimed_count <> o.quantity OR EXISTS(SELECT 1 FROM unnest(contents) AS c WHERE nullif(btrim(c),'') IS NULL) THEN RAISE EXCEPTION 'Insufficient valid stock' USING ERRCODE='P0002'; END IF;
  UPDATE public.orders SET status='completed', delivered_content=array_to_string(contents,E'\n---\n'), meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('paid',true,'stock_fulfilled_at',now()),updated_at=now() WHERE id=o.id;
 EXCEPTION WHEN SQLSTATE 'P0002' THEN RETURN jsonb_build_object('status','out_of_stock');
 END;
 RETURN jsonb_build_object('status','completed','changed',true,'quantity',claimed_count);
END;
$function$;
REVOKE ALL ON FUNCTION public.fulfill_charged_reseller_stock(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_charged_reseller_stock(uuid) TO service_role;