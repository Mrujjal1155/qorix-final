CREATE TABLE public.admin_stock_exports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 admin_user_id uuid NOT NULL,
 product_id uuid NOT NULL,
 stock_ids uuid[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
 deleted_at timestamptz
);
GRANT SELECT ON public.admin_stock_exports TO authenticated;
GRANT ALL ON public.admin_stock_exports TO service_role;
ALTER TABLE public.admin_stock_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_own_stock_exports ON public.admin_stock_exports FOR SELECT TO authenticated USING (admin_user_id = auth.uid() AND public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_export_unsold_stock(_product_id uuid, _quantity integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE picked_ids uuid[]; picked_items jsonb; receipt_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF _quantity IS NULL OR _quantity < 1 OR _quantity > 1000 THEN RAISE EXCEPTION 'Choose between 1 and 1000 accounts'; END IF;
 PERFORM id FROM public.products WHERE id = _product_id AND supplier_id IS NULL AND owner_reseller_id IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only admin in-house stock can be exported'; END IF;
 SELECT array_agg(id ORDER BY created_at, id), jsonb_agg(jsonb_build_object('id', id, 'content', content) ORDER BY created_at, id)
 INTO picked_ids, picked_items FROM (
  SELECT id, content, created_at FROM public.stock_items WHERE product_id = _product_id AND is_sold = false ORDER BY created_at, id LIMIT _quantity FOR SHARE SKIP LOCKED
 ) picked;
 IF coalesce(cardinality(picked_ids), 0) <> _quantity THEN RAISE EXCEPTION 'Not enough available accounts. Refresh and try again.'; END IF;
 INSERT INTO public.admin_stock_exports(admin_user_id, product_id, stock_ids) VALUES (auth.uid(), _product_id, picked_ids) RETURNING id INTO receipt_id;
 RETURN jsonb_build_object('export_id', receipt_id, 'items', picked_items);
END $$;
REVOKE ALL ON FUNCTION public.admin_export_unsold_stock(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_export_unsold_stock(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_exported_stock(_export_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE receipt public.admin_stock_exports%ROWTYPE; locked_ids uuid[]; removed integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT * INTO receipt FROM public.admin_stock_exports WHERE id = _export_id AND admin_user_id = auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Export not found'; END IF;
 IF receipt.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('deleted', 0, 'already_deleted', true); END IF;
 IF receipt.expires_at <= now() THEN RAISE EXCEPTION 'Export expired. Export again before deleting.'; END IF;
 PERFORM id FROM public.products WHERE id = receipt.product_id AND supplier_id IS NULL AND owner_reseller_id IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only admin in-house stock can be deleted'; END IF;
 SELECT array_agg(id) INTO locked_ids FROM (
  SELECT id FROM public.stock_items WHERE id = ANY(receipt.stock_ids) AND product_id = receipt.product_id AND is_sold = false ORDER BY id FOR UPDATE SKIP LOCKED
 ) locked;
 IF coalesce(cardinality(locked_ids), 0) <> cardinality(receipt.stock_ids) THEN RAISE EXCEPTION 'An exported account was sold, removed or is being processed. Nothing was deleted. Export again.'; END IF;
 DELETE FROM public.stock_items WHERE product_id = receipt.product_id AND id = ANY(locked_ids) AND is_sold = false;
 GET DIAGNOSTICS removed = ROW_COUNT;
 UPDATE public.admin_stock_exports SET deleted_at = now() WHERE id = receipt.id;
 RETURN jsonb_build_object('deleted', removed, 'already_deleted', false);
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_exported_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_exported_stock(uuid) TO authenticated;