CREATE OR REPLACE FUNCTION public.orders_snapshot_unit_cost()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c numeric; sup uuid; pc numeric;
BEGIN
  IF NEW.product_id IS NULL OR (NEW.meta ? 'unit_cost') THEN RETURN NEW; END IF;
  SELECT supplier_id, cost_price INTO sup, pc FROM public.products WHERE id = NEW.product_id;
  IF sup IS NOT NULL THEN
    SELECT cost_price INTO c FROM public.supplier_products WHERE product_id = NEW.product_id ORDER BY last_synced_at DESC LIMIT 1;
  ELSE
    c := pc;
  END IF;
  NEW.meta := coalesce(NEW.meta, '{}'::jsonb) || jsonb_build_object('unit_cost', coalesce(c, 0));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_orders_snapshot_unit_cost ON public.orders;
CREATE TRIGGER trg_orders_snapshot_unit_cost BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_snapshot_unit_cost();