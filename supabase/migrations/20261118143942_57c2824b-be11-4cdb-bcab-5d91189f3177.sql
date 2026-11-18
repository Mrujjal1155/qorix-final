CREATE TABLE public.web_link_codes (
  code text PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  used_at timestamptz,
  used_by bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.web_link_codes TO service_role;
ALTER TABLE public.web_link_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX web_link_codes_user_idx ON public.web_link_codes (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_id_unique ON public.profiles (telegram_id) WHERE telegram_id IS NOT NULL;

-- Atomically consume a code and connect the Telegram account (one website account <-> one Telegram account).
CREATE OR REPLACE FUNCTION public.consume_web_link_code(_code text, _telegram_id bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; other uuid;
BEGIN
  SELECT * INTO r FROM web_link_codes WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF r.used_at IS NOT NULL THEN RETURN 'used'; END IF;
  IF r.expires_at < now() THEN RETURN 'expired'; END IF;
  SELECT id INTO other FROM profiles WHERE telegram_id = _telegram_id AND id <> r.user_id;
  IF other IS NOT NULL THEN RETURN 'taken'; END IF;
  UPDATE profiles SET telegram_id = _telegram_id WHERE id = r.user_id;
  IF NOT FOUND THEN RETURN 'no_profile'; END IF;
  UPDATE web_link_codes SET used_at = now(), used_by = _telegram_id WHERE code = _code;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.consume_web_link_code(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_web_link_code(text, bigint) TO service_role;