CREATE OR REPLACE FUNCTION public.stock_counter_bump(_pid uuid, _d integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF _d < 0 THEN
    UPDATE public.stock_counters SET available = GREATEST(available + _d, 0), updated_at = now() WHERE product_id = _pid;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _pid) THEN RETURN; END IF;
  INSERT INTO public.stock_counters(product_id, available, updated_at)
  VALUES (_pid, _d, now())
  ON CONFLICT (product_id) DO UPDATE
    SET available = GREATEST(public.stock_counters.available + _d, 0), updated_at = now();
END $$;
DELETE FROM public.products WHERE id = '906cae46-2840-4434-973d-923885352a3a';