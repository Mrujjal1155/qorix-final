CREATE TABLE public.reseller_product_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  min_qty integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_product_prices TO authenticated;
GRANT ALL ON public.reseller_product_prices TO service_role;
ALTER TABLE public.reseller_product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage reseller product prices" ON public.reseller_product_prices FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_reseller_product_prices_updated_at BEFORE UPDATE ON public.reseller_product_prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();