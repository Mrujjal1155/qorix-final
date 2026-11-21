CREATE TABLE public.bot_direct_pay_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  meta jsonb NOT NULL,
  total numeric NOT NULL,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  deposit_id uuid,
  method text,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.bot_direct_pay_links FROM anon, authenticated;
GRANT ALL ON public.bot_direct_pay_links TO service_role;
ALTER TABLE public.bot_direct_pay_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX bot_direct_pay_links_tg_idx ON public.bot_direct_pay_links (telegram_id, created_at DESC);