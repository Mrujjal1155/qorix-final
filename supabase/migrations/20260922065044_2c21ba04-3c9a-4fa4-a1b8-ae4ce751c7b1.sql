-- Public read for displaying images on the site/bot.
CREATE POLICY "public_images_public_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'public-images');

-- Only admins may write; service_role bypasses RLS for server uploads.
CREATE POLICY "public_images_admin_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'public-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "public_images_admin_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'public-images' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'public-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "public_images_admin_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'public-images' AND public.has_role(auth.uid(), 'admin'));