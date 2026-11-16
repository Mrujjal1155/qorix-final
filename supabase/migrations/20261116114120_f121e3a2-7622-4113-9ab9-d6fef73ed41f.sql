CREATE TABLE public.supplier_buy_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), admin_id uuid NOT NULL REFERENCES auth.users(id), supplier_id uuid NOT NULL REFERENCES public.suppliers(id), supplier_product_id uuid NOT NULL REFERENCES public.supplier_products(id), external_id text NOT NULL, product_name text NOT NULL, target integer NOT NULL CHECK(target > 0 AND target <= 100000), acquired integer NOT NULL DEFAULT 0 CHECK(acquired >= 0 AND acquired <= target), status text NOT NULL DEFAULT 'paused' CHECK(status IN ('watching','paused','purchasing','completed','review','cancelled')), last_checked_at timestamptz, last_stock integer, message text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supplier_buy_orders TO authenticated;
GRANT ALL ON public.supplier_buy_orders TO service_role;
ALTER TABLE public.supplier_buy_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_buy_admin_read ON public.supplier_buy_orders FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TABLE public.supplier_buy_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buy_order_id uuid NOT NULL REFERENCES public.supplier_buy_orders(id), quantity integer NOT NULL CHECK(quantity>0), status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','completed','rejected','unknown')), supplier_order_id text, items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(items)='array'), message text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supplier_buy_batches TO authenticated;
GRANT ALL ON public.supplier_buy_batches TO service_role;
ALTER TABLE public.supplier_buy_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_buy_batch_admin_read ON public.supplier_buy_batches FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE UNIQUE INDEX supplier_buy_unresolved_batch ON public.supplier_buy_batches(buy_order_id) WHERE status IN ('submitted','unknown');
CREATE UNIQUE INDEX supplier_buy_active_product ON public.supplier_buy_orders(supplier_id,external_id) WHERE status IN ('watching','paused','purchasing','review');
CREATE TRIGGER supplier_buy_orders_updated BEFORE UPDATE ON public.supplier_buy_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER supplier_buy_batches_updated BEFORE UPDATE ON public.supplier_buy_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE FUNCTION public.claim_supplier_buy_batch(p_order uuid,p_qty integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.supplier_buy_orders; b uuid;
BEGIN
 SELECT * INTO o FROM public.supplier_buy_orders WHERE id=p_order FOR UPDATE;
 IF o.id IS NULL OR o.status<>'watching' OR p_qty<1 OR p_qty>o.target-o.acquired THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=o.supplier_id AND is_enabled) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.supplier_buy_batches WHERE buy_order_id=p_order AND status IN ('submitted','unknown')) THEN RETURN NULL; END IF;
 INSERT INTO public.supplier_buy_batches(buy_order_id,quantity) VALUES(p_order,p_qty) RETURNING id INTO b;
 UPDATE public.supplier_buy_orders SET status='purchasing',message='' WHERE id=p_order;
 RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.claim_supplier_buy_batch(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_supplier_buy_batch(uuid,integer) TO service_role;
CREATE FUNCTION public.finish_supplier_buy_batch(p_batch uuid,p_status text,p_items jsonb,p_supplier_order text,p_message text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 UPDATE public.supplier_buy_orders SET acquired=acquired+n,status=CASE WHEN p_status='unknown' THEN 'review' WHEN o.status IN ('paused','cancelled') THEN o.status WHEN acquired+n=target THEN 'completed' WHEN p_status='rejected' THEN 'paused' ELSE 'watching' END,message=left(coalesce(p_message,''),300) WHERE id=o.id;
END $$;
REVOKE ALL ON FUNCTION public.finish_supplier_buy_batch(uuid,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_supplier_buy_batch(uuid,text,jsonb,text,text) TO service_role;