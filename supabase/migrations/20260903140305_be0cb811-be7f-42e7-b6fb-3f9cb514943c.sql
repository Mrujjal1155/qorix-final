CREATE UNIQUE INDEX IF NOT EXISTS products_supplier_unique
  ON public.products (supplier_id, supplier_external_id)
  WHERE supplier_id IS NOT NULL AND supplier_external_id IS NOT NULL;