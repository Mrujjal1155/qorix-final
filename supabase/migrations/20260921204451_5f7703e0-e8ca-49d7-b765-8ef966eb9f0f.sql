-- ============ 1. profiles: ban flag + telegram link ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_id bigint;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_id_key ON public.profiles(telegram_id) WHERE telegram_id IS NOT NULL;

-- ============ 2. unified referral settings (copy old web_* values once) ============
INSERT INTO public.bot_settings(key, value)
SELECT 'referral_min_order', COALESCE((SELECT value FROM public.bot_settings WHERE key='web_referral_min_order'), '0')
WHERE NOT EXISTS (SELECT 1 FROM public.bot_settings WHERE key='referral_min_order');
INSERT INTO public.bot_settings(key, value)
SELECT 'referral_max_commission', COALESCE((SELECT value FROM public.bot_settings WHERE key='web_referral_max_commission'), '0')
WHERE NOT EXISTS (SELECT 1 FROM public.bot_settings WHERE key='referral_max_commission');
INSERT INTO public.bot_settings(key, value)
SELECT 'referral_enabled', COALESCE((SELECT value FROM public.bot_settings WHERE key='web_referral_enabled'), 'on')
WHERE NOT EXISTS (SELECT 1 FROM public.bot_settings WHERE key='referral_enabled');
INSERT INTO public.bot_settings(key, value)
SELECT 'referral_percent', COALESCE((SELECT value FROM public.bot_settings WHERE key='web_referral_percent'), '2')
WHERE NOT EXISTS (SELECT 1 FROM public.bot_settings WHERE key='referral_percent');

CREATE OR REPLACE FUNCTION public.referral_setting(_key text, _fallback text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    NULLIF((SELECT value FROM public.bot_settings WHERE key = _key), ''),
    NULLIF((SELECT value FROM public.bot_settings WHERE key = 'web_' || _key), ''),
    _fallback
  )
$$;

-- ============ 3. commission ledger ============
CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  order_no bigint,
  channel text NOT NULL DEFAULT 'website',
  referrer_user_id uuid,
  referrer_telegram_id bigint,
  buyer_user_id uuid,
  buyer_telegram_id bigint,
  percent numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  reversed_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'credited',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz
);
GRANT SELECT ON public.referral_commissions TO authenticated;
GRANT ALL ON public.referral_commissions TO service_role;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read referral commissions" ON public.referral_commissions;
CREATE POLICY "Admins read referral commissions" ON public.referral_commissions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS referral_commissions_referrer_idx ON public.referral_commissions(referrer_user_id, referrer_telegram_id);

-- ============ 4. referral credit store tables ============
CREATE TABLE IF NOT EXISTS public.referral_credits (
  telegram_id bigint PRIMARY KEY,
  earned numeric NOT NULL DEFAULT 0,
  spent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_credits TO authenticated;
GRANT ALL ON public.referral_credits TO service_role;
ALTER TABLE public.referral_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read referral credits" ON public.referral_credits;
CREATE POLICY "Admins read referral credits" ON public.referral_credits
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.referral_credit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_telegram_id bigint NOT NULL,
  invitee_telegram_id bigint NOT NULL UNIQUE,
  credits numeric NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  awarded_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_credit_events TO authenticated;
GRANT ALL ON public.referral_credit_events TO service_role;
ALTER TABLE public.referral_credit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read referral credit events" ON public.referral_credit_events;
CREATE POLICY "Admins read referral credit events" ON public.referral_credit_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS referral_credit_events_inviter_idx ON public.referral_credit_events(inviter_telegram_id, status);

CREATE TABLE IF NOT EXISTS public.referral_credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  name text NOT NULL,
  credits numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.referral_credit_purchases TO authenticated;
GRANT ALL ON public.referral_credit_purchases TO service_role;
ALTER TABLE public.referral_credit_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read referral credit purchases" ON public.referral_credit_purchases;
CREATE POLICY "Admins read referral credit purchases" ON public.referral_credit_purchases
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS referral_credit_purchases_user_idx ON public.referral_credit_purchases(telegram_id);

-- backfill from bot_users.state->refstore
INSERT INTO public.referral_credits (telegram_id, earned, spent)
SELECT u.telegram_id,
       COALESCE((u.state->'refstore'->>'earned')::numeric, 0),
       COALESCE((u.state->'refstore'->>'spent')::numeric, 0)
FROM public.bot_users u
WHERE u.state ? 'refstore'
ON CONFLICT (telegram_id) DO NOTHING;

INSERT INTO public.referral_credit_purchases (telegram_id, name, credits, created_at)
SELECT u.telegram_id,
       COALESCE(p->>'name', 'Reward'),
       COALESCE((p->>'credits')::numeric, 0),
       COALESCE((p->>'at')::timestamptz, now())
FROM public.bot_users u
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(u.state->'refstore'->'purchases', '[]'::jsonb)) AS p
WHERE jsonb_typeof(COALESCE(u.state->'refstore'->'purchases', '[]'::jsonb)) = 'array';

INSERT INTO public.referral_credit_events (inviter_telegram_id, invitee_telegram_id, credits, status, awarded_on)
SELECT u.referred_by, u.telegram_id, 0, 'awarded', (u.created_at)::date
FROM public.bot_users u
WHERE u.referred_by IS NOT NULL
  AND COALESCE((u.state->'refstore'->>'credited')::boolean, false) = true
ON CONFLICT (invitee_telegram_id) DO NOTHING;

-- ============ 5. credit store functions ============
CREATE OR REPLACE FUNCTION public.referral_credit_flush(_inviter bigint, _cap integer)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE used integer; awarded numeric := 0; ev record;
BEGIN
  SELECT count(*) INTO used FROM public.referral_credit_events
   WHERE inviter_telegram_id = _inviter AND status = 'awarded' AND awarded_on = current_date;
  FOR ev IN SELECT * FROM public.referral_credit_events
             WHERE inviter_telegram_id = _inviter AND status = 'pending'
             ORDER BY created_at LOOP
    EXIT WHEN used >= GREATEST(1, _cap);
    UPDATE public.referral_credit_events SET status = 'awarded', awarded_on = current_date WHERE id = ev.id;
    INSERT INTO public.referral_credits (telegram_id, earned)
    VALUES (_inviter, ev.credits)
    ON CONFLICT (telegram_id) DO UPDATE
      SET earned = public.referral_credits.earned + ev.credits, updated_at = now();
    used := used + 1;
    awarded := awarded + ev.credits;
  END LOOP;
  RETURN awarded;
END $$;

CREATE OR REPLACE FUNCTION public.referral_credit_award(_inviter bigint, _invitee bigint, _credits numeric, _cap integer)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _inviter IS NULL OR _invitee IS NULL OR _inviter = _invitee THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.bot_users WHERE telegram_id = _inviter AND is_banned) THEN RETURN 0; END IF;
  INSERT INTO public.referral_credit_events (inviter_telegram_id, invitee_telegram_id, credits)
  VALUES (_inviter, _invitee, GREATEST(0, _credits))
  ON CONFLICT (invitee_telegram_id) DO NOTHING;
  RETURN public.referral_credit_flush(_inviter, _cap);
END $$;

CREATE OR REPLACE FUNCTION public.referral_credit_spend(_tid bigint, _credits numeric, _name text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean := false;
BEGIN
  UPDATE public.referral_credits
     SET spent = spent + _credits, updated_at = now()
   WHERE telegram_id = _tid AND (earned - spent) >= _credits
  RETURNING true INTO ok;
  IF COALESCE(ok, false) AND _name IS NOT NULL THEN
    INSERT INTO public.referral_credit_purchases (telegram_id, name, credits) VALUES (_tid, _name, _credits);
  END IF;
  RETURN COALESCE(ok, false);
END $$;

-- ============ 6. unified commission award / reverse ============
CREATE OR REPLACE FUNCTION public.referral_award(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o record;
  channel text;
  pct numeric; min_order numeric; max_comm numeric; enabled text;
  commission numeric;
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

  pct := COALESCE(NULLIF(public.referral_setting('referral_percent', '2'), '')::numeric, 2);
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

  commission := round(COALESCE(o.total, 0) * pct / 100.0, 2);
  IF max_comm > 0 AND commission > max_comm THEN commission := max_comm; END IF;
  IF commission <= 0 THEN skip_reason := COALESCE(skip_reason, 'zero'); END IF;

  IF skip_reason IS NOT NULL THEN
    INSERT INTO public.referral_commissions
      (order_id, order_no, channel, referrer_user_id, referrer_telegram_id, buyer_user_id, buyer_telegram_id, percent, amount, status, reason)
    VALUES (o.id, o.order_no, channel, ref_uid, ref_tid, buyer_uid, NULLIF(o.telegram_id, 0), pct, 0, 'skipped', skip_reason);
    RETURN jsonb_build_object('ok', false, 'reason', skip_reason);
  END IF;

  IF ref_uid IS NOT NULL THEN
    UPDATE public.profiles
       SET wallet_balance = wallet_balance + commission,
           referral_earnings = referral_earnings + commission
     WHERE id = ref_uid
    RETURNING wallet_balance INTO new_balance;
    INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, reference, note)
    VALUES (ref_uid, 'referral', commission, COALESCE(new_balance, 0), o.order_no::text,
            'Referral commission ' || pct || '% from order #' || o.order_no);
  ELSE
    UPDATE public.bot_users
       SET balance = balance + commission,
           referral_earnings = referral_earnings + commission
     WHERE telegram_id = ref_tid
    RETURNING balance INTO new_balance;
    IF new_balance IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_referrer'); END IF;
    INSERT INTO public.transactions (telegram_id, type, amount, method, reference, note)
    VALUES (ref_tid, 'referral', commission, 'referral', o.order_no::text,
            'Referral commission ' || pct || '% from order #' || o.order_no);
  END IF;

  INSERT INTO public.referral_commissions
    (order_id, order_no, channel, referrer_user_id, referrer_telegram_id, buyer_user_id, buyer_telegram_id, percent, amount, status)
  VALUES (o.id, o.order_no, channel, ref_uid, ref_tid, buyer_uid, NULLIF(o.telegram_id, 0), pct, commission, 'credited');

  UPDATE public.orders SET referral_credited = true WHERE id = o.id AND referral_credited = false;

  RETURN jsonb_build_object('ok', true, 'amount', commission);
END $$;

CREATE OR REPLACE FUNCTION public.referral_reverse(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; take numeric; bal numeric;
BEGIN
  SELECT * INTO c FROM public.referral_commissions WHERE order_id = _order_id AND status = 'credited' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

  IF c.referrer_user_id IS NOT NULL THEN
    SELECT wallet_balance INTO bal FROM public.profiles WHERE id = c.referrer_user_id;
    take := LEAST(c.amount, GREATEST(0, COALESCE(bal, 0)));
    UPDATE public.profiles
       SET wallet_balance = wallet_balance - take,
           referral_earnings = GREATEST(0, referral_earnings - c.amount)
     WHERE id = c.referrer_user_id
    RETURNING wallet_balance INTO bal;
    INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, reference, note)
    VALUES (c.referrer_user_id, 'referral_reversal', -take, COALESCE(bal, 0), c.order_no::text,
            'Referral reversed — order #' || c.order_no || ' cancelled/refunded');
  ELSIF c.referrer_telegram_id IS NOT NULL THEN
    SELECT balance INTO bal FROM public.bot_users WHERE telegram_id = c.referrer_telegram_id;
    take := LEAST(c.amount, GREATEST(0, COALESCE(bal, 0)));
    UPDATE public.bot_users
       SET balance = balance - take,
           referral_earnings = GREATEST(0, referral_earnings - c.amount)
     WHERE telegram_id = c.referrer_telegram_id;
    INSERT INTO public.transactions (telegram_id, type, amount, method, reference, note)
    VALUES (c.referrer_telegram_id, 'referral_reversal', -take, 'referral', c.order_no::text,
            'Referral reversed — order #' || c.order_no || ' cancelled/refunded');
  ELSE
    take := 0;
  END IF;

  UPDATE public.referral_commissions
     SET status = 'reversed', reversed_amount = take, reversed_at = now(),
         reason = CASE WHEN take < c.amount THEN 'partial_clawback' ELSE NULL END
   WHERE id = c.id;

  RETURN jsonb_build_object('ok', true, 'clawed_back', take, 'outstanding', c.amount - take);
END $$;

-- ============ 7. triggers on orders ============
DROP TRIGGER IF EXISTS trg_orders_referral_commission ON public.orders;
DROP TRIGGER IF EXISTS trg_orders_referral_commission_ins ON public.orders;

CREATE OR REPLACE FUNCTION public.orders_referral_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    PERFORM public.referral_award(NEW.id);
  ELSIF NEW.status IN ('cancelled', 'refunded', 'failed') THEN
    PERFORM public.referral_reverse(NEW.id);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_orders_referral_after_ins
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_referral_sync();

CREATE TRIGGER trg_orders_referral_after_upd
AFTER UPDATE OF status ON public.orders
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.orders_referral_sync();