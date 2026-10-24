CREATE OR REPLACE FUNCTION public.fulfill_paid_inhouse_order(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders%ROWTYPE; p public.products%ROWTYPE; contents text[]; n integer; paid boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
 IF o.reseller_id IS NOT NULL THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 SELECT * INTO p FROM public.products WHERE id=o.product_id FOR SHARE;
 IF NOT FOUND OR p.supplier_id IS NOT NULL OR p.delivery_type<>'auto' OR o.quantity<1 THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 IF o.status='refunded' OR coalesce((o.meta->>'refunded')::boolean,false) THEN RETURN jsonb_build_object('status','refunded'); END IF;
 paid := coalesce((o.meta->>'paid')::boolean,false) OR coalesce((o.meta->>'eps_paid')::boolean,false) OR nullif(o.meta->>'paid_at','') IS NOT NULL OR o.status='completed' OR (o.status='pending' AND o.source<>'website' AND NOT coalesce((o.meta->>'awaiting_payment')::boolean,false));
 IF NOT paid OR coalesce((o.meta->>'awaiting_payment')::boolean,false) THEN RETURN jsonb_build_object('status','unpaid'); END IF;
 IF nullif(btrim(o.delivered_content),'') IS NOT NULL THEN RETURN jsonb_build_object('status','completed','changed',false); END IF;
 IF o.status NOT IN ('pending','failed','cancelled') THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 BEGIN
  SELECT array_agg(s.content),count(*)::integer INTO contents,n FROM public.claim_stock_items(o.product_id,o.quantity,NULLIF(o.telegram_id,0)) s;
  IF n<>o.quantity OR EXISTS(SELECT 1 FROM unnest(contents) c WHERE nullif(btrim(c),'') IS NULL) THEN RAISE EXCEPTION 'Stock unavailable' USING ERRCODE='P0002'; END IF;
  UPDATE public.orders SET status='completed',delivered_content=array_to_string(contents,E'\n---\n'),meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('paid',true,'awaiting_payment',false,'inhouse_fulfilled_at',now()),updated_at=now() WHERE id=o.id;
 EXCEPTION WHEN SQLSTATE 'P0002' THEN RETURN jsonb_build_object('status','out_of_stock'); END;
 RETURN jsonb_build_object('status','completed','changed',true,'quantity',n);
END $$;
REVOKE ALL ON FUNCTION public.fulfill_paid_inhouse_order(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_paid_inhouse_order(uuid) TO service_role;