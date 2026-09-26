DROP POLICY IF EXISTS public_images_public_read ON storage.objects;
CREATE POLICY public_images_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'public-images' AND public.has_role(auth.uid(), 'admin'));

-- Reseller-private products must not be readable by anonymous visitors
DROP POLICY IF EXISTS "public read active products" ON public.products;