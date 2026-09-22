CREATE OR REPLACE FUNCTION public.bot_user_admin_adjust(
  _telegram_id bigint,
  _amount numeric,
  _note text DEFAULT 'Dashboard adjustment'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _amt numeric := round(coalesce(_amount, 0)::numeric, 2);
  _bal numeric;
BEGIN
  IF _amt = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  END IF;

  SELECT balance INTO _bal FROM public.bot_users
   WHERE telegram_id = _telegram_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_user');
  END IF;

  IF coalesce(_bal, 0) + _amt < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient', 'balance', coalesce(_bal, 0));
  END IF;

  _bal := round(coalesce(_bal, 0) + _amt, 2);
  UPDATE public.bot_users SET balance = _bal, updated_at = now()
   WHERE telegram_id = _telegram_id;

  INSERT INTO public.transactions (telegram_id, type, amount, method, note)
  VALUES (_telegram_id, 'admin', _amt, 'wallet', _note);

  RETURN jsonb_build_object('ok', true, 'balance', _bal);
END;
$$;

REVOKE ALL ON FUNCTION public.bot_user_admin_adjust(bigint, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_user_admin_adjust(bigint, numeric, text) TO service_role;