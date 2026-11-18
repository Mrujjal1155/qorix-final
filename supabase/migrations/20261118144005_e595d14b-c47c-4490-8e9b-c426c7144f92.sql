DROP INDEX IF EXISTS public.profiles_telegram_id_unique;
CREATE POLICY "No direct client access to link codes" ON public.web_link_codes FOR ALL TO authenticated USING (false) WITH CHECK (false);