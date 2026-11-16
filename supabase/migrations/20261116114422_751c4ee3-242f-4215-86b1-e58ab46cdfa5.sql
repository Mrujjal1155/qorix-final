CREATE OR REPLACE FUNCTION public.claim_supplier_buy_batch(p_order uuid,p_qty integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.supplier_buy_orders; b uuid;
BEGIN
 SELECT * INTO o FROM public.supplier_buy_orders WHERE id=p_order FOR UPDATE;
 IF o.id IS NULL OR o.status<>'watching' OR p_qty<1 OR p_qty>o.target-o.acquired THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(o.supplier_id::text||':'||o.external_id,0));
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=o.supplier_id AND is_enabled) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.supplier_buy_batches b JOIN public.supplier_buy_orders old ON old.id=b.buy_order_id WHERE old.supplier_id=o.supplier_id AND old.external_id=o.external_id AND b.status IN ('submitted','unknown')) THEN RETURN NULL; END IF;
 INSERT INTO public.supplier_buy_batches(buy_order_id,quantity) VALUES(p_order,p_qty) RETURNING id INTO b;
 UPDATE public.supplier_buy_orders SET status='purchasing',message='' WHERE id=p_order;
 RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.claim_supplier_buy_batch(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_supplier_buy_batch(uuid,integer) TO service_role;