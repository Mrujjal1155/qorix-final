ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manual_stock_limited boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_manual_stock(_pid uuid, _qty integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  INSERT INTO public.stock_counters(product_id, available, updated_at)
  VALUES (_pid, greatest(0, coalesce(_qty, 0)), now())
  ON CONFLICT (product_id) DO UPDATE SET available = greatest(0, coalesce(_qty, 0)), updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.set_manual_stock(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_manual_stock(uuid, integer) TO authenticated, service_role;

-- Atomically take manual stock; returns true for unlimited manual products.
CREATE OR REPLACE FUNCTION public.take_manual_stock(_pid uuid, _qty integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE lim boolean; n integer;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT manual_stock_limited INTO lim FROM public.products WHERE id = _pid AND delivery_type = 'manual';
  IF NOT coalesce(lim, false) THEN RETURN true; END IF;
  UPDATE public.stock_counters SET available = available - greatest(1, _qty), updated_at = now()
   WHERE product_id = _pid AND available >= greatest(1, _qty);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION public.take_manual_stock(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_manual_stock(uuid, integer) TO service_role;