-- Reseller-owned products (uploaded from the reseller panel).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS owner_reseller_id uuid REFERENCES public.resellers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS products_owner_reseller_idx
  ON public.products(owner_reseller_id) WHERE owner_reseller_id IS NOT NULL;

-- Public storefront / bot policies must never expose another reseller's own product.
DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read" ON public.products
  FOR SELECT TO anon, authenticated
  USING (is_active = true AND owner_reseller_id IS NULL);