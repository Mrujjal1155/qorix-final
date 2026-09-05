INSERT INTO public.bot_settings (key, value) VALUES
  ('web_referral_enabled', 'on'),
  ('web_referral_min_order', '0'),
  ('web_referral_max_commission', '0')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.credit_website_referral()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  buyer_id uuid;
  referrer uuid;
  pct numeric;
  commission numeric;
  new_balance numeric;
  enabled text;
  min_order numeric;
  max_comm numeric;
BEGIN
  IF NEW.status <> 'completed' OR COALESCE(NEW.referral_credited, false) THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.source, '') <> 'website' THEN
    RETURN NEW;
  END IF;

  SELECT lower(coalesce(value,'on')) INTO enabled FROM public.bot_settings WHERE key = 'web_referral_enabled';
  IF coalesce(enabled, 'on') NOT IN ('on','true','1','yes') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(value, '')::numeric, 0) INTO min_order FROM public.bot_settings WHERE key = 'web_referral_min_order';
  min_order := COALESCE(min_order, 0);
  IF COALESCE(NEW.total, 0) < min_order THEN
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

  SELECT COALESCE(NULLIF(value, '')::numeric, 0) INTO max_comm FROM public.bot_settings WHERE key = 'web_referral_max_commission';
  max_comm := COALESCE(max_comm, 0);
  IF max_comm > 0 AND commission > max_comm THEN
    commission := max_comm;
  END IF;

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
$function$;