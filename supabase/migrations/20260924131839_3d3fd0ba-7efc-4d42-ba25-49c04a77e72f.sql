CREATE TABLE public.bulk_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  product_ids uuid[] NOT NULL DEFAULT '{}',
  channel text NOT NULL DEFAULT 'both',
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_discounts TO authenticated;
GRANT ALL ON public.bulk_discounts TO service_role;
ALTER TABLE public.bulk_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bulk discounts" ON public.bulk_discounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER bulk_discounts_updated_at BEFORE UPDATE ON public.bulk_discounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();