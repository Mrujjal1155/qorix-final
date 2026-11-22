CREATE OR REPLACE FUNCTION public.finish_website_fulfillment(_order_id uuid,_token uuid,_items jsonb,_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; content text; valid boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _token IS NULL THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND OR o.source<>'website' OR o.reseller_id IS NOT NULL OR o.meta->>'website_supplier_attempt' IS DISTINCT FROM _token::text THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 IF o.status='completed' THEN RETURN jsonb_build_object('status','completed','changed',false); END IF;
 IF o.status<>'pending' OR o.meta->>'website_supplier_state' IS DISTINCT FROM 'processing' OR public.payment_order_is_paid(o.meta) IS NOT TRUE OR coalesce(o.meta->>'refunded','false')='true' THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 valid:=jsonb_typeof(_items)='array';
 IF valid THEN valid:=jsonb_array_length(_items)=o.quantity AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(_items) i WHERE jsonb_typeof(i)<>'string' OR nullif(btrim(i#>>'{}'),'') IS NULL); END IF;
 IF NOT coalesce(valid,false) OR _reason IS NOT NULL THEN
  UPDATE public.orders SET meta=meta||jsonb_build_object('website_supplier_state','review','website_supplier_items',coalesce(_items,'[]'::jsonb),'supplier_error',left(coalesce(_reason,'Incomplete supplier delivery'),500)),updated_at=clock_timestamp() WHERE id=o.id;
  RETURN jsonb_build_object('status','review');
 END IF;
 SELECT string_agg(value,E'\n---\n' ORDER BY ord) INTO content FROM jsonb_array_elements_text(_items) WITH ORDINALITY a(value,ord);
 UPDATE public.orders SET status='completed',delivered_content=content,meta=(meta-'supplier_error'-'supplier_error_at')||jsonb_build_object('website_supplier_state','completed'),updated_at=clock_timestamp() WHERE id=o.id;
 RETURN jsonb_build_object('status','completed','changed',true);
END $$;
REVOKE ALL ON FUNCTION public.finish_website_fulfillment(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_website_fulfillment(uuid,uuid,jsonb,text) TO service_role;