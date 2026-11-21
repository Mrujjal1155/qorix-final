CREATE TABLE public.bot_browser_payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),telegram_id bigint NOT NULL,token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),snapshot jsonb NOT NULL,total numeric NOT NULL CHECK(total>0),status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','starting','pending','cancelled','expired')),gateway text,deposit_id uuid UNIQUE REFERENCES public.binance_deposits(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes');
GRANT ALL ON public.bot_browser_payments TO service_role;
ALTER TABLE public.bot_browser_payments ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX bot_browser_payments_active_user ON public.bot_browser_payments(telegram_id) WHERE status IN ('ready','starting','pending');
CREATE FUNCTION public.touch_bot_browser_payment() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER touch_bot_browser_payment BEFORE UPDATE ON public.bot_browser_payments FOR EACH ROW EXECUTE FUNCTION public.touch_bot_browser_payment();
CREATE FUNCTION public.issue_bot_browser_payment(_telegram_id bigint,_hash text,_snapshot jsonb,_total numeric,_orders jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE l public.bot_browser_payments; o jsonb; BEGIN
PERFORM id FROM public.bot_users WHERE telegram_id=_telegram_id AND NOT is_banned FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Wallet unavailable'; END IF;
UPDATE public.bot_browser_payments SET status='expired' WHERE telegram_id=_telegram_id AND expires_at<=now() AND status IN ('ready','starting','pending');
UPDATE public.orders SET status='cancelled' WHERE telegram_id=_telegram_id AND status='awaiting_payment' AND meta->>'browser_link_id' IN (SELECT id::text FROM public.bot_browser_payments WHERE telegram_id=_telegram_id AND status='expired');
IF EXISTS(SELECT 1 FROM public.bot_browser_payments WHERE telegram_id=_telegram_id AND status IN ('ready','starting','pending')) THEN RAISE EXCEPTION 'An existing payment link is still open. Complete or cancel it first.'; END IF;
IF jsonb_array_length(_orders)<1 OR jsonb_array_length(_orders)>100 THEN RAISE EXCEPTION 'Invalid checkout'; END IF;
IF abs((SELECT sum((x->>'total')::numeric) FROM jsonb_array_elements(_orders) x)-_total)>0.001 THEN RAISE EXCEPTION 'Invalid total'; END IF;
INSERT INTO public.bot_browser_payments(telegram_id,token_hash,snapshot,total) VALUES(_telegram_id,_hash,_snapshot,_total) RETURNING * INTO l;
FOR o IN SELECT * FROM jsonb_array_elements(_orders) LOOP
INSERT INTO public.orders(telegram_id,product_id,product_name,quantity,unit_price,total,status,delivery_type,coupon_code,discount,meta) VALUES(_telegram_id,(o->>'product_id')::uuid,o->>'product_name',(o->>'quantity')::integer,(o->>'unit_price')::numeric,(o->>'total')::numeric,'awaiting_payment',o->>'delivery_type',o->>'coupon_code',(o->>'discount')::numeric,jsonb_build_object('browser_link_id',l.id,'awaiting_payment',true,'gateway','browser'));
END LOOP; RETURN jsonb_build_object('id',l.id,'expires_at',l.expires_at); END $$;
CREATE FUNCTION public.bind_bot_browser_payment(_id uuid,_deposit_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE l public.bot_browser_payments; d public.binance_deposits; BEGIN
SELECT * INTO l FROM public.bot_browser_payments WHERE id=_id FOR UPDATE;
SELECT * INTO d FROM public.binance_deposits WHERE id=_deposit_id FOR UPDATE;
IF l.status IS DISTINCT FROM 'starting' OR l.expires_at<=now() OR d.telegram_id IS DISTINCT FROM l.telegram_id OR d.status IS DISTINCT FROM 'pending' OR d.meta->>'browser_link_id' IS DISTINCT FROM l.id::text OR d.amount_usdt IS DISTINCT FROM l.total THEN RAISE EXCEPTION 'Payment cannot be attached'; END IF;
UPDATE public.binance_deposits SET expires_at=least(expires_at,l.expires_at),created_at=l.created_at WHERE id=d.id;
UPDATE public.orders SET meta=meta||jsonb_build_object('deposit_id',d.id,'gateway',l.gateway) WHERE telegram_id=l.telegram_id AND meta->>'browser_link_id'=l.id::text AND status='awaiting_payment'; IF NOT FOUND THEN RAISE EXCEPTION 'Original orders missing'; END IF;
UPDATE public.bot_browser_payments SET deposit_id=d.id,status='pending' WHERE id=l.id; END $$;
CREATE FUNCTION public.cancel_bot_browser_payment(_id uuid,_telegram_id bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE l public.bot_browser_payments; d public.binance_deposits; BEGIN
SELECT * INTO l FROM public.bot_browser_payments WHERE id=_id AND telegram_id=_telegram_id FOR UPDATE; IF NOT FOUND OR l.status NOT IN ('ready','pending') THEN RETURN false; END IF;
IF l.deposit_id IS NOT NULL THEN SELECT * INTO d FROM public.binance_deposits WHERE id=l.deposit_id FOR UPDATE; IF d.status IS DISTINCT FROM 'pending' THEN RETURN false; END IF; UPDATE public.binance_deposits SET status='failed',expires_at=least(expires_at,now()) WHERE id=d.id; END IF;
UPDATE public.orders SET status='cancelled' WHERE telegram_id=_telegram_id AND meta->>'browser_link_id'=l.id::text AND status='awaiting_payment';
UPDATE public.bot_browser_payments SET status='cancelled' WHERE id=l.id; RETURN true; END $$;
REVOKE ALL ON FUNCTION public.issue_bot_browser_payment(bigint,text,jsonb,numeric,jsonb),public.bind_bot_browser_payment(uuid,uuid),public.cancel_bot_browser_payment(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_bot_browser_payment(bigint,text,jsonb,numeric,jsonb),public.bind_bot_browser_payment(uuid,uuid),public.cancel_bot_browser_payment(uuid,bigint) TO service_role;