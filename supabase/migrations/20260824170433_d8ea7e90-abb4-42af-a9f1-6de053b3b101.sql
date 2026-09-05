INSERT INTO public.categories (name, emoji, sort_order, channel, is_active) VALUES
 ('AI Tools', '🤖', 4, 'both', true),
 ('Creative & Design', '🎨', 5, 'both', true),
 ('Productivity', '🗂️', 6, 'both', true),
 ('Music & Audio', '🎵', 7, 'both', true),
 ('Gaming', '🎮', 8, 'both', true),
 ('Courses & Learning', '🎓', 9, 'both', true),
 ('Software Keys', '🔑', 10, 'both', true),
 ('Marketing & SEO', '📈', 11, 'both', true);

CREATE TABLE public.hero_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT,
  accent TEXT NOT NULL DEFAULT 'primary',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.hero_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hero_items TO authenticated;
GRANT ALL ON public.hero_items TO service_role;

ALTER TABLE public.hero_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active hero items" ON public.hero_items FOR SELECT USING (is_active = true);
CREATE POLICY "Admins manage hero items" ON public.hero_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_hero_items_updated_at BEFORE UPDATE ON public.hero_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.hero_items (name, image_url, accent, sort_order) VALUES
 ('ChatGPT Plus', NULL, 'emerald', 1),
 ('Midjourney', NULL, 'amber', 2),
 ('Netflix Premium', NULL, 'rose', 3),
 ('VPN Pro', NULL, 'sky', 4);