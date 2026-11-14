-- ============================================================
-- Lifetime referral commission on ACTUAL admin net profit (5%)
-- ============================================================

-- 1) Extra ledger columns (no money is moved by this part)
ALTER TABLE public.referral_commissions
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS admin_profit numeric,
  ADD COLUMN IF NOT EXISTS wallet_amount numeric;

COMMENT ON COLUMN public.referral_commissions.admin_profit IS 'Admin net profit (selling price minus purchase-time cost x quantity) this commission was computed from';
COMMENT ON COLUMN public.referral_commissions.wallet_amount IS 'Amount actually credited to the wallet, rounded to whole cents';

-- 2) Default rate 5% for both channels (admin can still change it)
INSERT INTO public.bot_settings (key, value, updated_at)
VALUES ('referral_percent', '5', now())
ON CONFLICT (key) DO UPDATE SET value = '5', updated_at = now();

INSERT INTO public.bot_settings (key, value, updated_at)
VALUES ('web_referral_percent', '5', now())
ON CONFLICT (key) DO UPDATE SET value = '5', updated_at = now();

-- 3) Award commissions from net profit, with exact ledger precision
CREATE OR REPLACE FUNCTION public.referral_award(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  o record;
  channel text;
  pct numeric; min_order numeric; max_comm numeric; enabled text;
  unit_cost numeric; profit numeric; commission numeric; credited numeric;
  buyer_uid uuid; ref_uid uuid; ref_tid bigint;
  new_balance numeric;
  skip_reason text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR o.status <> 'completed' THEN RETURN jsonb_build_object('ok', false); END IF;
  IF EXISTS (SELECT 1 FROM public.referral_commissions WHERE order_id = _order_id) THEN
    RETURN jsonb_build_object('ok', false, 'duplicate', true);
  END IF;

  enabled := lower(public.referral_setting('referral_enabled', 'on'));
  IF enabled NOT IN ('on','true','1','yes') THEN RETURN jsonb_build_object('ok', false, 'reason', 'disabled'); END IF;

  pct := COALESCE(NULLIF(public.referral_setting('referral_percent', '5'), '')::numeric, 5);
  min_order := COALESCE(NULLIF(public.referral_setting('referral_min_order', '0'), '')::numeric, 0);
  max_comm := COALESCE(NULLIF(public.referral_setting('referral_max_commission', '0'), '')::numeric, 0);

  IF o.source LIKE 'api%' THEN RETURN jsonb_build_object('ok', false, 'reason', 'api'); END IF;
  channel := CASE WHEN o.source = 'website' THEN 'website' ELSE 'bot' END;

  -- resolve buyer + referrer
  IF channel = 'website' THEN
    buyer_uid := o.user_id;
    IF buyer_uid IS NULL AND o.customer_email IS NOT NULL THEN
      SELECT id INTO buyer_uid FROM public.profiles WHERE lower(email) = lower(o.customer_email) LIMIT 1;
    END IF;
    IF buyer_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_buyer'); END IF;
    SELECT referred_by INTO ref_uid FROM public.profiles WHERE id = buyer_uid;
    IF ref_uid IS NULL OR ref_uid = buyer_uid THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referrer'); END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = ref_uid AND is_banned) THEN skip_reason := 'referrer_banned'; END IF;
  ELSE
    IF COALESCE(o.telegram_id, 0) <= 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_buyer'); END IF;
    SELECT referred_by INTO ref_tid FROM public.bot_users WHERE telegram_id = o.telegram_id;
    IF ref_tid IS NULL OR ref_tid = o.telegram_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referrer'); END IF;
    IF EXISTS (SELECT 1 FROM public.bot_users WHERE telegram_id = ref_tid AND is_banned) THEN skip_reason := 'referrer_banned'; END IF;
    -- same person on both channels: pay into the linked website wallet instead
    SELECT id INTO ref_uid FROM public.profiles WHERE telegram_id = ref_tid AND COALESCE(is_banned, false) = false;
  END IF;

  IF COALESCE(o.total, 0) < min_order THEN skip_reason := COALESCE(skip_reason, 'below_min_order'); END IF;

  -- Admin net profit = selling price - (cost locked at purchase time x quantity).
  -- Orders with no recorded cost count as full-price profit (owner decision).
  unit_cost := CASE
    WHEN o.meta ? 'unit_cost' AND (o.meta->>'unit_cost') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (o.meta->>'unit_cost')::numeric
    ELSE 0 END;
  profit := COALESCE(o.total, 0) - unit_cost * COALESCE(NULLIF(o.quantity, 0), 1);

  -- Exact commission, no rounding: $0.10 profit at 5% stays $0.005.
  commission := profit * pct / 100.0;
  IF max_comm > 0 AND commission > max_comm THEN commission := max_comm; END IF;

  IF profit <= 0 OR commission <= 0 THEN skip_reason := COALESCE(skip_reason, 'no_profit'); END IF;

  -- Wallets hold whole cents only; the ledger keeps the exact figure above.
  credited := CASE WHEN commission > 0 THEN round(commission, 2) ELSE 0 END;

  IF skip_reason IS NOT NULL THEN
    INSERT INTO public.referral_commissions
      (order_id, order_no, channel, referrer_user_id, referrer_telegram_id, buyer_user_id, buyer_telegram_id,
       percent, amount, wallet_amount, admin_profit, product_name, status, reason)
    VALUES (o.id, o.order_no, channel, ref_uid, ref_tid, buyer_uid, NULLIF(o.telegram_id, 0),
            pct, 0, 0, profit, o.product_name, 'skipped', skip_reason);
    RETURN jsonb_build_object('ok', false, 'reason', skip_reason);
  END IF;

  IF ref_uid IS NOT NULL THEN
    IF credited > 0 THEN
      UPDATE public.profiles
         SET wallet_balance = wallet_balance + credited,
             referral_earnings = referral_earnings + credited
       WHERE id = ref_uid
      RETURNING wallet_balance INTO new_balance;
      INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, reference, note)
      VALUES (ref_uid, 'referral', credited, COALESCE(new_balance, 0), o.order_no::text,
              'Referral commission ' || pct || '% of profit #' || o.order_no);
    END IF;
  ELSE
    IF credited > 0 THEN
      UPDATE public.bot_users
         SET balance = balance + credited,
             referral_earnings = referral_earnings + credited
       WHERE telegram_id = ref_tid
      RETURNING balance INTO new_balance;
      IF new_balance IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referrer'); END IF;
      INSERT INTO public.transactions (telegram_id, type, amount, method, reference, note)
      VALUES (ref_tid, 'referral', credited, 'referral', o.order_no::text,
              'Referral commission ' || pct || '% of profit #' || o.order_no);
    END IF;
  END IF;

  INSERT INTO public.referral_commissions
    (order_id, order_no, channel, referrer_user_id, referrer_telegram_id, buyer_user_id, buyer_telegram_id,
     percent, amount, wallet_amount, admin_profit, product_name, status, reason)
  VALUES (o.id, o.order_no, channel, ref_uid, ref_tid, buyer_uid, NULLIF(o.telegram_id, 0),
          pct, commission, credited, profit, o.product_name, 'credited',
          CASE WHEN credited <= 0 THEN 'sub_cent_wallet' ELSE NULL END);

  UPDATE public.orders SET referral_credited = true WHERE id = o.id AND referral_credited = false;

  RETURN jsonb_build_object('ok', true, 'amount', commission, 'credited', credited, 'profit', profit);
END
$function$;

-- 4) Reversal takes back exactly what was credited to the wallet
CREATE OR REPLACE FUNCTION public.referral_reverse(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE c record; take numeric; bal numeric; due numeric;
BEGIN
  SELECT * INTO c FROM public.referral_commissions WHERE order_id = _order_id AND status = 'credited' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

  due := COALESCE(c.wallet_amount, c.amount, 0);

  IF c.referrer_user_id IS NOT NULL THEN
    SELECT wallet_balance INTO bal FROM public.profiles WHERE id = c.referrer_user_id;
    take := LEAST(due, GREATEST(0, COALESCE(bal, 0)));
    UPDATE public.profiles
       SET wallet_balance = wallet_balance - take,
           referral_earnings = GREATEST(0, referral_earnings - due)
     WHERE id = c.referrer_user_id
    RETURNING wallet_balance INTO bal;
    INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, reference, note)
    VALUES (c.referrer_user_id, 'referral_reversal', -take, COALESCE(bal, 0), c.order_no::text,
            'Referral reversed — order #' || c.order_no || ' cancelled/refunded');
  ELSIF c.referrer_telegram_id IS NOT NULL THEN
    SELECT balance INTO bal FROM public.bot_users WHERE telegram_id = c.referrer_telegram_id;
    take := LEAST(due, GREATEST(0, COALESCE(bal, 0)));
    UPDATE public.bot_users
       SET balance = balance - take,
           referral_earnings = GREATEST(0, referral_earnings - due)
     WHERE telegram_id = c.referrer_telegram_id;
    INSERT INTO public.transactions (telegram_id, type, amount, method, reference, note)
    VALUES (c.referrer_telegram_id, 'referral_reversal', -take, 'referral', c.order_no::text,
            'Referral reversed — order #' || c.order_no || ' cancelled/refunded');
  ELSE
    take := 0;
  END IF;

  UPDATE public.referral_commissions
     SET status = 'reversed', reversed_amount = take, reversed_at = now(),
         reason = CASE WHEN take < due THEN 'partial_clawback' ELSE NULL END
   WHERE id = c.id;

  RETURN jsonb_build_object('ok', true, 'clawed_back', take, 'outstanding', due - take);
END
$function$;

-- 5) Private, page-by-page commission history for one Telegram user.
--    Only the bot's own server (service role) may call it, and it returns
--    rows belonging to that single user only.
CREATE OR REPLACE FUNCTION public.referral_commission_history(
  _telegram_id bigint, _page integer, _page_size integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid; size integer; off integer; total bigint; rows jsonb;
BEGIN
  IF _telegram_id IS NULL OR _telegram_id <= 0 THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'total', 0, 'page', 0, 'page_size', 10);
  END IF;

  size := LEAST(GREATEST(COALESCE(_page_size, 10), 1), 25);
  off  := GREATEST(COALESCE(_page, 0), 0) * size;

  SELECT id INTO uid FROM public.profiles WHERE telegram_id = _telegram_id LIMIT 1;

  SELECT count(*) INTO total
  FROM public.referral_commissions rc
  WHERE rc.status <> 'skipped'
    AND (rc.referrer_telegram_id = _telegram_id OR (uid IS NOT NULL AND rc.referrer_user_id = uid));

  SELECT jsonb_agg(x ORDER BY x.created_at DESC, x.id DESC) INTO rows
  FROM (
    SELECT rc.id, rc.order_no, rc.product_name, rc.admin_profit, rc.percent, rc.amount,
           rc.wallet_amount, rc.status, rc.reversed_amount, rc.created_at,
           rc.buyer_telegram_id, rc.buyer_user_id, rc.channel
    FROM public.referral_commissions rc
    WHERE rc.status <> 'skipped'
      AND (rc.referrer_telegram_id = _telegram_id OR (uid IS NOT NULL AND rc.referrer_user_id = uid))
    ORDER BY rc.created_at DESC, rc.id DESC
    LIMIT size OFFSET off
  ) x;

  RETURN jsonb_build_object(
    'rows', COALESCE(rows, '[]'::jsonb),
    'total', COALESCE(total, 0),
    'page', GREATEST(COALESCE(_page, 0), 0),
    'page_size', size
  );
END
$function$;

REVOKE ALL ON FUNCTION public.referral_commission_history(bigint, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_commission_history(bigint, integer, integer) TO service_role;
