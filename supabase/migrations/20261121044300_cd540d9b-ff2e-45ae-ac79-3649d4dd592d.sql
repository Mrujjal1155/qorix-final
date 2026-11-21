CREATE OR REPLACE FUNCTION public.claim_web_login_code(_code text, _secret_hash text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM web_login_codes WHERE code = _code FOR UPDATE;
  IF NOT FOUND OR r.secret_hash <> _secret_hash OR r.confirmed_at IS NULL OR r.claimed_at IS NOT NULL
     OR r.expires_at <= now() OR r.confirmed_at < now() - interval '10 minutes' THEN RETURN NULL; END IF;
  UPDATE web_login_codes SET claimed_at = now() WHERE code = _code;
  RETURN r.telegram_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_web_login_code(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_web_login_code(text, text) TO service_role;