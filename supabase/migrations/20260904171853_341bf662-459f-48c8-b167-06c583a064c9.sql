CREATE TABLE public.currency_rates (
  code text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  rate numeric NOT NULL DEFAULT 1,
  locale_tag text NOT NULL DEFAULT 'en-US',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.currency_rates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.currency_rates TO authenticated;
GRANT ALL ON public.currency_rates TO service_role;

ALTER TABLE public.currency_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Currency rates are public" ON public.currency_rates
  FOR SELECT USING (true);

CREATE POLICY "Admins manage currency rates" ON public.currency_rates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_currency_rates_updated
  BEFORE UPDATE ON public.currency_rates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.currency_rates (code, name, rate, locale_tag, sort_order) VALUES
  ('USD', 'US Dollar', 1, 'en-US', 1),
  ('BRL', 'Brazilian Real', 5.4, 'pt-BR', 2),
  ('EUR', 'Euro', 0.92, 'de-DE', 3),
  ('INR', 'Indian Rupee', 83, 'en-IN', 4),
  ('PKR', 'Pakistani Rupee', 278, 'en-PK', 5),
  ('BDT', 'Bangladeshi Taka', 120, 'bn-BD', 6),
  ('NGN', 'Nigerian Naira', 1500, 'en-NG', 7),
  ('SAR', 'Saudi Riyal', 3.75, 'ar-SA', 8);