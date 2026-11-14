INSERT INTO public.bot_settings(key,value) VALUES ('referral_mode','off'),('referral_enabled','off'),('web_referral_enabled','off') ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now();
CREATE OR REPLACE FUNCTION public.current_referral_mode() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT COALESCE((SELECT CASE WHEN value IN ('points','commission') THEN value ELSE 'off' END FROM public.bot_settings WHERE key='referral_mode'),'off') $$;
REVOKE ALL ON FUNCTION public.current_referral_mode() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.current_referral_mode() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.guard_referral_mode() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NEW.key='referral_mode' AND NEW.value NOT IN ('off','points','commission') THEN RAISE EXCEPTION 'Invalid referral mode'; END IF; RETURN NEW; END $$;
CREATE TRIGGER validate_referral_mode BEFORE INSERT OR UPDATE ON public.bot_settings FOR EACH ROW EXECUTE FUNCTION public.guard_referral_mode();
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS referral_mode_at_completion text;
CREATE OR REPLACE FUNCTION public.snapshot_referral_mode() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF TG_OP='UPDATE' THEN NEW.referral_mode_at_completion:=OLD.referral_mode_at_completion; END IF;
 IF NEW.status='completed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'completed') AND NEW.referral_mode_at_completion IS NULL THEN
 PERFORM 1 FROM public.bot_settings WHERE key='referral_mode' FOR SHARE;
 NEW.referral_mode_at_completion:=public.current_referral_mode(); END IF; RETURN NEW; END $$;
CREATE TRIGGER capture_referral_mode BEFORE INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.snapshot_referral_mode();
-- Gate existing financial functions without replacing their approved profit/refund rules.
DO $$ DECLARE f record; def text; gate text; BEGIN
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('referral_award','referral_credit_award','referral_credit_flush','referral_credit_spend','credit_website_referral') LOOP
 def:=pg_get_functiondef(f.oid);
 IF f.proname='referral_award' THEN gate:='PERFORM 1 FROM public.bot_settings WHERE key=''referral_mode'' FOR SHARE; IF public.current_referral_mode() <> ''commission'' OR NOT EXISTS (SELECT 1 FROM public.orders WHERE id=_order_id AND referral_mode_at_completion=''commission'') THEN RETURN jsonb_build_object(''ok'',false,''reason'',''disabled''); END IF;';
 ELSIF f.proname='credit_website_referral' THEN gate:='PERFORM 1 FROM public.bot_settings WHERE key=''referral_mode'' FOR SHARE; IF public.current_referral_mode() <> ''commission'' OR NEW.referral_mode_at_completion IS DISTINCT FROM ''commission'' THEN RETURN NEW; END IF;';
 ELSIF f.proname='referral_credit_spend' THEN gate:='RETURN false;';
 ELSE gate:='PERFORM 1 FROM public.bot_settings WHERE key=''referral_mode'' FOR SHARE; IF public.current_referral_mode() <> ''points'' THEN RETURN 0; END IF;'; END IF;
 def:=regexp_replace(def,'\mBEGIN\M','BEGIN '||gate,'i'); EXECUTE def;
 END LOOP; END $$;
-- Keep old points safe under concurrent product views/flushes; queued invites retain their original daily rules.
CREATE OR REPLACE FUNCTION public.referral_credit_flush(_inviter bigint,_cap integer) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE used integer; awarded numeric:=0; ev record; BEGIN
 PERFORM 1 FROM public.bot_settings WHERE key='referral_mode' FOR SHARE; IF public.current_referral_mode()<>'points' THEN RETURN 0; END IF;
 PERFORM 1 FROM public.bot_users WHERE telegram_id=_inviter AND NOT is_banned FOR UPDATE; IF NOT FOUND THEN RETURN 0; END IF;
 SELECT count(*) INTO used FROM public.referral_credit_events WHERE inviter_telegram_id=_inviter AND status='awarded' AND awarded_on=current_date;
 FOR ev IN SELECT * FROM public.referral_credit_events WHERE inviter_telegram_id=_inviter AND status='pending' ORDER BY created_at,id FOR UPDATE LOOP
 EXIT WHEN used>=GREATEST(1,_cap);
 UPDATE public.referral_credit_events SET status='awarded',awarded_on=current_date WHERE id=ev.id AND status='pending';
 INSERT INTO public.referral_credits(telegram_id,earned) VALUES(_inviter,ev.credits) ON CONFLICT(telegram_id) DO UPDATE SET earned=public.referral_credits.earned+ev.credits,updated_at=now(); used:=used+1; awarded:=awarded+ev.credits; END LOOP; RETURN awarded; END $$;
REVOKE ALL ON FUNCTION public.referral_credit_flush(bigint,integer),public.referral_credit_award(bigint,bigint,numeric,integer),public.referral_credit_spend(bigint,numeric,text) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.referral_credit_flush(bigint,integer),public.referral_credit_award(bigint,bigint,numeric,integer),public.referral_credit_spend(bigint,numeric,text) TO service_role;
CREATE TABLE public.referral_product_rewards(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,credits numeric NOT NULL,is_active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT,INSERT,UPDATE ON public.referral_product_rewards TO authenticated; GRANT ALL ON public.referral_product_rewards TO service_role;
ALTER TABLE public.referral_product_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY rewards_admin ON public.referral_product_rewards FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE TABLE public.referral_reward_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),telegram_id bigint NOT NULL,reward_id uuid NOT NULL REFERENCES public.referral_product_rewards(id) ON DELETE RESTRICT,product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,product_name text NOT NULL,credits numeric NOT NULL,status text NOT NULL DEFAULT 'pending',reviewed_by uuid,reviewed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.referral_reward_requests TO authenticated; GRANT ALL ON public.referral_reward_requests TO service_role;
ALTER TABLE public.referral_reward_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY requests_admin_read ON public.referral_reward_requests FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE UNIQUE INDEX referral_one_pending_reward ON public.referral_reward_requests(telegram_id,reward_id) WHERE status='pending'; CREATE INDEX referral_requests_status_date ON public.referral_reward_requests(status,created_at DESC);
CREATE TABLE public.referral_reward_deliveries(request_id uuid PRIMARY KEY REFERENCES public.referral_reward_requests(id) ON DELETE RESTRICT,stock_id uuid NOT NULL UNIQUE,content text NOT NULL,claim_token uuid,lease_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),attempts integer NOT NULL DEFAULT 0,delivered_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.referral_reward_deliveries TO service_role;
ALTER TABLE public.referral_reward_deliveries ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.validate_referral_reward() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.credits<1 OR NEW.credits<>trunc(NEW.credits) THEN RAISE EXCEPTION 'Reward points must be a positive integer'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=NEW.product_id AND supplier_id IS NULL AND owner_reseller_id IS NULL AND delivery_type='auto') THEN RAISE EXCEPTION 'Select an in-house automatic product'; END IF; RETURN NEW; END $$;
CREATE TRIGGER validate_reward BEFORE INSERT OR UPDATE ON public.referral_product_rewards FOR EACH ROW EXECUTE FUNCTION public.validate_referral_reward();
CREATE TRIGGER rewards_updated BEFORE UPDATE ON public.referral_product_rewards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER requests_updated BEFORE UPDATE ON public.referral_reward_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER deliveries_updated BEFORE UPDATE ON public.referral_reward_deliveries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE FUNCTION public.request_referral_reward(_tid bigint,_reward uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r record; p record; req uuid; BEGIN
 PERFORM 1 FROM public.bot_settings WHERE key='referral_mode' FOR SHARE; IF public.current_referral_mode()<>'points' THEN RETURN jsonb_build_object('ok',false,'reason','disabled'); END IF;
 PERFORM 1 FROM public.bot_users WHERE telegram_id=_tid AND NOT is_banned FOR UPDATE; IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','unavailable'); END IF;
 SELECT * INTO r FROM public.referral_product_rewards WHERE id=_reward AND is_active FOR SHARE; IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','unavailable'); END IF;
 SELECT * INTO p FROM public.products WHERE id=r.product_id AND is_active AND supplier_id IS NULL AND owner_reseller_id IS NULL AND delivery_type='auto' FOR SHARE; IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','unavailable'); END IF;
 SELECT id INTO req FROM public.referral_reward_requests WHERE telegram_id=_tid AND reward_id=_reward AND status='pending'; IF FOUND THEN RETURN jsonb_build_object('ok',true,'id',req,'duplicate',true); END IF;
 UPDATE public.referral_credits SET spent=spent+r.credits,updated_at=now() WHERE telegram_id=_tid AND earned-spent>=r.credits; IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','points'); END IF;
 INSERT INTO public.referral_reward_requests(telegram_id,reward_id,product_id,product_name,credits) VALUES(_tid,r.id,p.id,p.name,r.credits) RETURNING id INTO req; RETURN jsonb_build_object('ok',true,'id',req); END $$;
CREATE OR REPLACE FUNCTION public.review_referral_reward(_request uuid,_approve boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r record; st record; BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 PERFORM 1 FROM public.bot_settings WHERE key='referral_mode' FOR SHARE;
 SELECT * INTO r FROM public.referral_reward_requests WHERE id=_request FOR UPDATE; IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','missing'); END IF;
 IF r.status<>'pending' THEN RETURN jsonb_build_object('ok',true,'status',r.status,'duplicate',true); END IF;
 IF NOT _approve THEN UPDATE public.referral_credits SET spent=spent-r.credits,updated_at=now() WHERE telegram_id=r.telegram_id; UPDATE public.referral_reward_requests SET status='rejected',reviewed_by=auth.uid(),reviewed_at=now() WHERE id=r.id; RETURN jsonb_build_object('ok',true,'status','rejected'); END IF;
 IF public.current_referral_mode()<>'points' THEN RETURN jsonb_build_object('ok',false,'reason','disabled'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bot_users WHERE telegram_id=r.telegram_id AND NOT is_banned) THEN RETURN jsonb_build_object('ok',false,'reason','banned'); END IF;
 PERFORM 1 FROM public.products WHERE id=r.product_id AND is_active AND supplier_id IS NULL AND owner_reseller_id IS NULL AND delivery_type='auto' FOR SHARE; IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','unavailable'); END IF;
 SELECT * INTO st FROM public.stock_items WHERE product_id=r.product_id AND NOT is_sold ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED; IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','stock'); END IF;
 UPDATE public.stock_items SET is_sold=true,sold_to=r.telegram_id,sold_at=now() WHERE id=st.id;
 INSERT INTO public.referral_reward_deliveries(request_id,stock_id,content) VALUES(r.id,st.id,st.content);
 UPDATE public.referral_reward_requests SET status='approved',reviewed_by=auth.uid(),reviewed_at=now() WHERE id=r.id;
 INSERT INTO public.referral_credit_purchases(telegram_id,name,credits) VALUES(r.telegram_id,r.product_name,r.credits);
 RETURN jsonb_build_object('ok',true,'status','approved'); END $$;
CREATE OR REPLACE FUNCTION public.claim_referral_deliveries() RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE d record; tok uuid; BEGIN
 FOR d IN SELECT v.*,r.telegram_id,r.product_name FROM public.referral_reward_deliveries v JOIN public.referral_reward_requests r ON r.id=v.request_id WHERE v.delivered_at IS NULL AND r.status='approved' AND v.next_attempt_at<=now() AND (v.lease_until IS NULL OR v.lease_until<now()) ORDER BY v.created_at LIMIT 3 FOR UPDATE OF v SKIP LOCKED LOOP
 tok:=gen_random_uuid(); UPDATE public.referral_reward_deliveries SET claim_token=tok,lease_until=now()+interval '5 minutes',attempts=attempts+1 WHERE request_id=d.request_id;
 RETURN NEXT jsonb_build_object('id',d.request_id,'telegram_id',d.telegram_id,'product_name',d.product_name,'content',d.content,'token',tok); END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.finish_referral_delivery(_request uuid,_token uuid,_success boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 UPDATE public.referral_reward_deliveries SET claim_token=NULL,lease_until=NULL,delivered_at=CASE WHEN _success THEN now() ELSE NULL END,next_attempt_at=now()+interval '1 minute' WHERE request_id=_request AND claim_token=_token AND delivered_at IS NULL; IF NOT FOUND THEN RETURN false; END IF;
 IF _success THEN UPDATE public.referral_reward_requests SET status='delivered' WHERE id=_request AND status='approved'; END IF; RETURN true; END $$;
REVOKE ALL ON FUNCTION public.request_referral_reward(bigint,uuid),public.claim_referral_deliveries(),public.finish_referral_delivery(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_referral_reward(bigint,uuid),public.claim_referral_deliveries(),public.finish_referral_delivery(uuid,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.review_referral_reward(uuid,boolean) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.review_referral_reward(uuid,boolean) TO authenticated;
