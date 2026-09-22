-- Atomic, idempotent wallet credit for Telegram bot users.
CREATE OR REPLACE FUNCTION public.bot_user_credit(
  _telegram_id bigint,
  _amount numeric,
  _type text DEFAULT 'refund',
  _method text DEFAULT 'wallet',
  _reference text DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _amt numeric := round(coalesce(_amount, 0)::numeric, 2);
  _bal numeric;
BEGIN
  IF _amt <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  -- Idempotency: the same reference for the same type is credited only once.
  IF _reference IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.transactions
    WHERE reference = _reference AND type = _type
  ) THEN
    SELECT balance INTO _bal FROM public.bot_users WHERE telegram_id = _telegram_id;
    RETURN jsonb_build_object('ok', false, 'duplicate', true, 'balance', coalesce(_bal, 0));
  END IF;

  -- Lock the row so concurrent credits cannot overwrite each other.
  SELECT balance INTO _bal FROM public.bot_users
   WHERE telegram_id = _telegram_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_user');
  END IF;

  _bal := round(coalesce(_bal, 0) + _amt, 2);
  UPDATE public.bot_users SET balance = _bal, updated_at = now()
   WHERE telegram_id = _telegram_id;

  INSERT INTO public.transactions (telegram_id, type, amount, method, reference, note)
  VALUES (_telegram_id, _type, _amt, _method, _reference, _note);

  RETURN jsonb_build_object('ok', true, 'balance', _bal, 'amount', _amt);
END;
$$;

REVOKE ALL ON FUNCTION public.bot_user_credit(bigint, numeric, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_user_credit(bigint, numeric, text, text, text, text) TO service_role;

-- Atomic, idempotent wallet credit for website profiles.
CREATE OR REPLACE FUNCTION public.profile_wallet_credit(
  _user_id uuid,
  _amount numeric,
  _type text DEFAULT 'refund',
  _reference text DEFAULT NULL,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _amt numeric := round(coalesce(_amount, 0)::numeric, 2);
  _bal numeric;
BEGIN
  IF _amt <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  IF _reference IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.wallet_transactions
    WHERE reference = _reference AND type = _type
  ) THEN
    SELECT wallet_balance INTO _bal FROM public.profiles WHERE id = _user_id;
    RETURN jsonb_build_object('ok', false, 'duplicate', true, 'balance', coalesce(_bal, 0));
  END IF;

  SELECT wallet_balance INTO _bal FROM public.profiles
   WHERE id = _user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_user');
  END IF;

  _bal := round(coalesce(_bal, 0) + _amt, 2);
  UPDATE public.profiles SET wallet_balance = _bal, updated_at = now()
   WHERE id = _user_id;

  INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, reference, note)
  VALUES (_user_id, _type, _amt, _bal, _reference, _note);

  RETURN jsonb_build_object('ok', true, 'balance', _bal, 'amount', _amt);
END;
$$;

REVOKE ALL ON FUNCTION public.profile_wallet_credit(uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_wallet_credit(uuid, numeric, text, text, text) TO service_role;