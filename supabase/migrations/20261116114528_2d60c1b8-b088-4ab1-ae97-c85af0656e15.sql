CREATE OR REPLACE FUNCTION public.finish_supplier_buy_batch(p_batch uuid,p_status text,p_items jsonb,p_supplier_order text,p_message text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.supplier_buy_batches; o public.supplier_buy_orders; n integer;
BEGIN
 SELECT * INTO b FROM public.supplier_buy_batches WHERE id=p_batch;
 IF b.id IS NULL THEN RAISE EXCEPTION 'Batch unavailable'; END IF;
 SELECT * INTO o FROM public.supplier_buy_orders WHERE id=b.buy_order_id FOR UPDATE;
 SELECT * INTO b FROM public.supplier_buy_batches WHERE id=p_batch FOR UPDATE;
 IF b.status<>'submitted' THEN RETURN; END IF;
 IF p_status NOT IN ('completed','rejected','unknown') OR jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 n:=jsonb_array_length(p_items);
 IF n>b.quantity OR o.acquired+n>o.target THEN RAISE EXCEPTION 'Delivery count exceeds purchase'; END IF;
 IF p_status='rejected' AND n<>0 THEN RAISE EXCEPTION 'Rejected batch has delivery'; END IF;
 IF p_status='completed' AND n<>b.quantity THEN p_status:='unknown'; END IF;
 UPDATE public.supplier_buy_batches SET status=p_status,items=p_items,supplier_order_id=p_supplier_order,message=left(coalesce(p_message,''),300) WHERE id=p_batch;
 UPDATE public.supplier_buy_orders SET acquired=acquired+n,status=CASE WHEN o.status='cancelled' THEN 'cancelled' WHEN p_status='unknown' THEN 'review' WHEN acquired+n=target THEN 'completed' WHEN o.status='paused' THEN 'paused' WHEN p_status='rejected' THEN 'paused' ELSE 'watching' END,message=left(coalesce(p_message,''),300) WHERE id=o.id;
END $$;
REVOKE ALL ON FUNCTION public.finish_supplier_buy_batch(uuid,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_supplier_buy_batch(uuid,text,jsonb,text,text) TO service_role;