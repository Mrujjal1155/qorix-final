CREATE TABLE public.web_login_codes (
  code text PRIMARY KEY,
  secret_hash text NOT NULL,
  telegram_id bigint,
  confirmed_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.web_login_codes TO service_role;
ALTER TABLE public.web_login_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX web_login_codes_created_idx ON public.web_login_codes (created_at);

CREATE OR REPLACE FUNCTION public.confirm_web_login_code(_code text, _telegram_id bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM web_login_codes WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN RETURN 'invalid'; END IF;
  IF r.confirmed_at IS NOT NULL THEN RETURN 'used'; END IF;
  IF r.expires_at < now() THEN RETURN 'expired'; END IF;
  UPDATE web_login_codes SET telegram_id = _telegram_id, confirmed_at = now() WHERE code = _code;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.confirm_web_login_code(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_web_login_code(text, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_web_login_code(_code text, _secret_hash text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM web_login_codes WHERE code = _code FOR UPDATE;
  IF NOT FOUND OR r.secret_hash <> _secret_hash OR r.confirmed_at IS NULL OR r.claimed_at IS NOT NULL
     OR r.confirmed_at < now() - interval '10 minutes' THEN RETURN NULL; END IF;
  UPDATE web_login_codes SET claimed_at = now() WHERE code = _code;
  RETURN r.telegram_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_web_login_code(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_web_login_code(text, text) TO service_role;