REVOKE ALL ON FUNCTION public.read_my_orders() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.read_my_orders() TO service_role;
CREATE FUNCTION public.read_customer_orders(_user_id uuid,_email text)
RETURNS TABLE(order_no bigint,product_name text,quantity integer,unit_price numeric,total numeric,status text,delivery_type text,delivered_content text,payment_method text,txid text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
SELECT o.order_no,o.product_name,o.quantity,o.unit_price,o.total,o.status,o.delivery_type,o.delivered_content,o.payment_method,o.txid,o.created_at
FROM public.orders o
WHERE _user_id IS NOT NULL AND (o.user_id=_user_id OR (nullif(_email,'') IS NOT NULL AND lower(o.customer_email)=lower(_email)))
ORDER BY o.created_at DESC LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.read_customer_orders(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_customer_orders(uuid,text) TO service_role;
COMMENT ON FUNCTION public.read_customer_orders(uuid,text) IS 'Server-only safe customer orders; caller identity must be verified before invoking.';