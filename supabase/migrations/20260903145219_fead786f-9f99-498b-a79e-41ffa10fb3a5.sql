CREATE TABLE IF NOT EXISTS public.reseller_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  telegram text,
  website text,
  channel text NOT NULL DEFAULT 'website',
  monthly_volume text,
  message text,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reseller_applications_status_idx ON public.reseller_applications (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_applications TO authenticated;
GRANT ALL ON public.reseller_applications TO service_role;

ALTER TABLE public.reseller_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage reseller applications" ON public.reseller_applications;
CREATE POLICY "Admins manage reseller applications"
ON public.reseller_applications FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));