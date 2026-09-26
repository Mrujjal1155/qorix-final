-- 1) Defense in depth: anon never writes directly; nobody but service_role can TRUNCATE (TRUNCATE bypasses RLS)
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon', t.tablename);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t.tablename);
  END LOOP;
END $$;

-- 2) Secret table: never readable through the API
REVOKE SELECT ON public.binance_credentials FROM anon, authenticated;

-- 3) profiles: users may only change their own name/email, never wallet/referral/ban fields
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;
GRANT INSERT (id, full_name, email) ON public.profiles TO authenticated;
GRANT UPDATE (id, full_name, email) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.profiles_lock_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.email := coalesce(nullif(auth.jwt() ->> 'email', ''), CASE WHEN TG_OP = 'UPDATE' THEN OLD.email ELSE NULL END);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.profiles_lock_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_profiles_lock_email ON public.profiles;
CREATE TRIGGER trg_profiles_lock_email BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_lock_email();

-- 4) Reseller top-ups: self-submitted requests must start as pending
DROP POLICY IF EXISTS "Resellers create own topups" ON public.reseller_topups;
CREATE POLICY "Resellers create own topups" ON public.reseller_topups
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND EXISTS (SELECT 1 FROM public.resellers r WHERE r.id = reseller_topups.reseller_id AND r.user_id = auth.uid())
  );