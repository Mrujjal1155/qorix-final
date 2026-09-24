CREATE INDEX IF NOT EXISTS stock_items_product_content_md5_idx
  ON public.stock_items (product_id, md5(btrim(content)));

CREATE OR REPLACE FUNCTION public.stock_items_skip_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.content := btrim(NEW.content);
  IF NEW.content = '' THEN RETURN NULL; END IF;
  IF EXISTS (
    SELECT 1 FROM public.stock_items s
     WHERE s.product_id = NEW.product_id
       AND md5(btrim(s.content)) = md5(NEW.content)
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_items_skip_duplicate ON public.stock_items;
CREATE TRIGGER trg_stock_items_skip_duplicate
  BEFORE INSERT ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.stock_items_skip_duplicate();