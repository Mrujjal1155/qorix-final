CREATE TABLE public.product_slugs (
  slug text PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.product_slugs TO service_role;
ALTER TABLE public.product_slugs ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX product_slugs_one_current ON public.product_slugs(product_id) WHERE is_current;

CREATE OR REPLACE FUNCTION public.product_slugify(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(nullif(trim(both '-' from regexp_replace(lower(coalesce(_name,'')), '[^a-z0-9]+', '-', 'g')), ''), 'product')
$$;

CREATE OR REPLACE FUNCTION public.assign_product_slug()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE base text; cand text; cur text; n int := 1;
BEGIN
  base := public.product_slugify(NEW.name);
  SELECT slug INTO cur FROM public.product_slugs WHERE product_id = NEW.id AND is_current;
  IF cur IS NOT NULL AND (cur = base OR cur LIKE base || '-%') THEN RETURN NEW; END IF;
  cand := base;
  WHILE EXISTS (SELECT 1 FROM public.product_slugs WHERE slug = cand AND product_id <> NEW.id) LOOP
    n := n + 1; cand := base || '-' || n;
  END LOOP;
  UPDATE public.product_slugs SET is_current = false WHERE product_id = NEW.id AND is_current;
  INSERT INTO public.product_slugs(slug, product_id, is_current) VALUES (cand, NEW.id, true)
    ON CONFLICT (slug) DO UPDATE SET is_current = true;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RETURN NEW; -- never block a product save because of a slug
END $$;
REVOKE EXECUTE ON FUNCTION public.assign_product_slug() FROM PUBLIC, anon, authenticated;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, name FROM public.products ORDER BY created_at, id LOOP
    PERFORM 1;
    DECLARE base text := public.product_slugify(r.name); cand text := base; n int := 1;
    BEGIN
      WHILE EXISTS (SELECT 1 FROM public.product_slugs WHERE slug = cand) LOOP n := n + 1; cand := base || '-' || n; END LOOP;
      INSERT INTO public.product_slugs(slug, product_id, is_current) VALUES (cand, r.id, true);
    END;
  END LOOP;
END $$;

CREATE TRIGGER products_assign_slug AFTER INSERT OR UPDATE OF name ON public.products
FOR EACH ROW EXECUTE FUNCTION public.assign_product_slug();