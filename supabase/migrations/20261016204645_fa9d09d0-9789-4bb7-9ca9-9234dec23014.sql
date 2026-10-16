CREATE OR REPLACE FUNCTION public.read_my_orders()
RETURNS TABLE(order_no bigint,product_name text,quantity integer,unit_price numeric,total numeric,status text,delivery_type text,delivered_content text,payment_method text,txid text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT o.order_no,o.product_name,o.quantity,o.unit_price,o.total,o.status,o.delivery_type,o.delivered_content,o.payment_method,o.txid,o.created_at
FROM public.orders o
WHERE auth.uid() IS NOT NULL AND (o.user_id=auth.uid() OR (o.customer_email IS NOT NULL AND lower(o.customer_email)=lower(coalesce(auth.jwt()->>'email',''))))
ORDER BY o.created_at DESC LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.read_my_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_my_orders() TO authenticated;
DROP POLICY IF EXISTS "users read own orders" ON public.orders;
COMMENT ON FUNCTION public.read_my_orders() IS 'Own-order customer projection: excludes internal meta and supplier diagnostics; admins retain their orders policy.';