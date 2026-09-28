CREATE TABLE public.user_product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price numeric NOT NULL,
  min_qty integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_id, product_id)
);
CREATE INDEX idx_user_product_prices_tid ON public.user_product_prices(telegram_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_product_prices TO authenticated;
GRANT ALL ON public.user_product_prices TO service_role;
ALTER TABLE public.user_product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage user prices" ON public.user_product_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_user_product_prices_updated BEFORE UPDATE ON public.user_product_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();