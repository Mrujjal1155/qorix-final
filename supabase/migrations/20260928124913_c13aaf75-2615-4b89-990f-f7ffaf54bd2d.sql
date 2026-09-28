CREATE TABLE public.stock_counters (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  available integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_counters TO authenticated;
GRANT ALL ON public.stock_counters TO service_role;
ALTER TABLE public.stock_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read stock counters" ON public.stock_counters FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "service role manages stock counters" ON public.stock_counters FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.stock_counter_bump(_pid uuid, _d integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.stock_counters(product_id, available, updated_at)
  VALUES (_pid, GREATEST(_d,0), now())
  ON CONFLICT (product_id) DO UPDATE
    SET available = GREATEST(public.stock_counters.available + _d, 0), updated_at = now();
$$;
REVOKE ALL ON FUNCTION public.stock_counter_bump(uuid,integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stock_items_counter_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT NEW.is_sold THEN PERFORM public.stock_counter_bump(NEW.product_id, 1); END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT OLD.is_sold THEN PERFORM public.stock_counter_bump(OLD.product_id, -1); END IF;
  ELSE
    IF NOT OLD.is_sold THEN PERFORM public.stock_counter_bump(OLD.product_id, -1); END IF;
    IF NOT NEW.is_sold THEN PERFORM public.stock_counter_bump(NEW.product_id, 1); END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_stock_items_counter
AFTER INSERT OR DELETE OR UPDATE OF is_sold, product_id ON public.stock_items
FOR EACH ROW EXECUTE FUNCTION public.stock_items_counter_sync();

LOCK TABLE public.stock_items IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.stock_counters(product_id, available)
SELECT product_id, count(*)::int FROM public.stock_items WHERE is_sold = false GROUP BY product_id
ON CONFLICT (product_id) DO UPDATE SET available = EXCLUDED.available, updated_at = now();

CREATE OR REPLACE FUNCTION public.stock_counts(_product_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(product_id uuid, available integer)
LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
  select c.product_id, c.available
  from public.stock_counters c
  where c.available > 0
    and (_product_ids is null or c.product_id = any(_product_ids))
$function$;