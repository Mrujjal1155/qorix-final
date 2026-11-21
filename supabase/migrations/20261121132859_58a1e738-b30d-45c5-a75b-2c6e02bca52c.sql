CREATE TABLE public.direct_pay_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  meta jsonb NOT NULL,
  total numeric NOT NULL CHECK (total > 0),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  started_method text,
  started_at timestamptz,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.direct_pay_links TO service_role;
ALTER TABLE public.direct_pay_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX direct_pay_links_tg_idx ON public.direct_pay_links (telegram_id, created_at DESC);