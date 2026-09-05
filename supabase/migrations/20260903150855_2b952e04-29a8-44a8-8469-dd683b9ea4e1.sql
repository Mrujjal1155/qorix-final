-- link a reseller to a login account
ALTER TABLE public.resellers ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS resellers_user_id_key ON public.resellers(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS resellers_email_lower_idx ON public.resellers(lower(email));

ALTER TABLE public.reseller_applications ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.reseller_applications ADD COLUMN IF NOT EXISTS invite_token text;
CREATE UNIQUE INDEX IF NOT EXISTS reseller_applications_invite_token_key ON public.reseller_applications(invite_token) WHERE invite_token IS NOT NULL;

-- reseller-initiated balance top-up requests
CREATE TABLE IF NOT EXISTS public.reseller_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'manual',
  txid text,
  sender_info text,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.reseller_topups TO authenticated;
GRANT ALL ON public.reseller_topups TO service_role;

ALTER TABLE public.reseller_topups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Resellers view own topups" ON public.reseller_topups;
CREATE POLICY "Resellers view own topups" ON public.reseller_topups
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.resellers r WHERE r.id = reseller_id AND r.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Resellers create own topups" ON public.reseller_topups;
CREATE POLICY "Resellers create own topups" ON public.reseller_topups
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.resellers r WHERE r.id = reseller_id AND r.user_id = auth.uid()));

DROP POLICY IF EXISTS "Admins manage topups" ON public.reseller_topups;
CREATE POLICY "Admins manage topups" ON public.reseller_topups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS reseller_topups_reseller_idx ON public.reseller_topups(reseller_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_reseller_topups_updated ON public.reseller_topups;
CREATE TRIGGER trg_reseller_topups_updated BEFORE UPDATE ON public.reseller_topups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- resellers: let a linked reseller read their own row
DROP POLICY IF EXISTS "Resellers view own account" ON public.resellers;
CREATE POLICY "Resellers view own account" ON public.resellers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));