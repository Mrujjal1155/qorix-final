-- 1. profile referral fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ref_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid,
  ADD COLUMN IF NOT EXISTS wallet_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_earnings numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_count integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_ref_code_key ON public.profiles (ref_code) WHERE ref_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_referred_by_idx ON public.profiles (referred_by);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referral_credited boolean NOT NULL DEFAULT false;

-- 2. wallet transactions
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'referral',
  amount numeric NOT NULL,
  balance_after numeric NOT NULL DEFAULT 0,
  reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own wallet transactions" ON public.wallet_transactions;
CREATE POLICY "Users read own wallet transactions"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS wallet_transactions_user_idx ON public.wallet_transactions (user_id, created_at DESC);

-- 3. ref code generator
CREATE OR REPLACE FUNCTION public.gen_profile_ref_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate text;
BEGIN
  IF NEW.ref_code IS NULL OR NEW.ref_code = '' THEN
    LOOP
      candidate := upper(substr(md5(gen_random_uuid()::text), 1, 8));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE ref_code = candidate);
    END LOOP;
    NEW.ref_code := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_ref_code ON public.profiles;
CREATE TRIGGER trg_profiles_ref_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.gen_profile_ref_code();

UPDATE public.profiles
   SET ref_code = upper(substr(md5(id::text || 'qorix'), 1, 8))
 WHERE ref_code IS NULL;

-- 4. referral commission on completed website orders
CREATE OR REPLACE FUNCTION public.credit_website_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  buyer_id uuid;
  referrer uuid;
  pct numeric;
  commission numeric;
  new_balance numeric;
BEGIN
  IF NEW.status <> 'completed' OR COALESCE(NEW.referral_credited, false) THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.source, '') <> 'website' THEN
    RETURN NEW;
  END IF;

  buyer_id := NEW.user_id;
  IF buyer_id IS NULL AND NEW.customer_email IS NOT NULL THEN
    SELECT id INTO buyer_id FROM public.profiles WHERE lower(email) = lower(NEW.customer_email) LIMIT 1;
  END IF;
  IF buyer_id IS NULL THEN RETURN NEW; END IF;

  SELECT referred_by INTO referrer FROM public.profiles WHERE id = buyer_id;
  IF referrer IS NULL OR referrer = buyer_id THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(value, '')::numeric, 2) INTO pct
    FROM public.bot_settings WHERE key = 'web_referral_percent';
  pct := COALESCE(pct, 2);

  commission := round(COALESCE(NEW.total, 0) * pct / 100.0, 2);
  IF commission <= 0 THEN RETURN NEW; END IF;

  UPDATE public.profiles
     SET wallet_balance = wallet_balance + commission,
         referral_earnings = referral_earnings + commission
   WHERE id = referrer
  RETURNING wallet_balance INTO new_balance;

  INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, reference, note)
  VALUES (referrer, 'referral', commission, COALESCE(new_balance, 0), NEW.order_no::text,
          'Referral commission ' || pct || '% from order #' || NEW.order_no);

  NEW.referral_credited := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_referral_commission ON public.orders;
CREATE TRIGGER trg_orders_referral_commission
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.credit_website_referral();

DROP TRIGGER IF EXISTS trg_orders_referral_commission_ins ON public.orders;
CREATE TRIGGER trg_orders_referral_commission_ins
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.credit_website_referral();

INSERT INTO public.bot_settings (key, value)
VALUES ('web_referral_percent', '2')
ON CONFLICT (key) DO NOTHING;