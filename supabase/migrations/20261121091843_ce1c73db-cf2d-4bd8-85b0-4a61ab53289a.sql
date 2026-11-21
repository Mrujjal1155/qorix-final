CREATE OR REPLACE FUNCTION public.find_tracking_orders(_kind text, _value text)
RETURNS TABLE(order_no bigint, order_code text, product_name text, quantity integer, total numeric, status text, delivered_content text, created_at timestamptz, customer_email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public
AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _value IS NULL OR length(_value) NOT BETWEEN 1 AND 160 OR _kind NOT IN ('number','code','email') THEN RETURN; END IF;
 RETURN QUERY SELECT o.order_no,
 CASE WHEN o.external_ref ~* '^QX-[a-z0-9]{4,32}$' THEN o.external_ref ELSE 'ORD-'||upper(right(replace(o.id::text,'-',''),8)) END,
 o.product_name,o.quantity,o.total,o.status,o.delivered_content,o.created_at,o.customer_email
 FROM public.orders o
 WHERE o.reseller_id IS NULL AND (
 (_kind='number' AND _value ~ '^[1-9][0-9]{0,11}$' AND o.order_no::text=_value)
 OR (_kind='code' AND _value ~* '^ORD-[a-f0-9]{8}$' AND right(replace(o.id::text,'-',''),8)=lower(substr(_value,5)))
 OR (_kind='code' AND _value ~* '^QX-[a-z0-9]{4,32}$' AND lower(o.external_ref)=lower(_value))
 OR (_kind='email' AND lower(o.customer_email)=lower(_value) AND o.source='website'))
 ORDER BY o.created_at DESC,o.id DESC LIMIT 20;
END $$;
REVOKE ALL ON FUNCTION public.find_tracking_orders(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.find_tracking_orders(text,text) TO service_role;