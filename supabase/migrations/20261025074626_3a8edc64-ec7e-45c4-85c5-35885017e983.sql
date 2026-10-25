ALTER TABLE public.stock_notification_events DROP CONSTRAINT stock_notification_events_product_id_fkey;
ALTER TABLE public.stock_notification_events ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.stock_notification_events ADD CONSTRAINT stock_notification_events_product_id_fkey FOREIGN KEY(product_id) REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.stock_notification_events ADD COLUMN product_snapshot jsonb, ADD COLUMN audience_message jsonb;
CREATE TABLE public.stock_notification_recipients(event_id uuid NOT NULL REFERENCES public.stock_notification_events(id) ON DELETE CASCADE, telegram_id bigint NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(event_id,telegram_id));
GRANT ALL ON public.stock_notification_recipients TO service_role;
ALTER TABLE public.stock_notification_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "server manages stock recipients" ON public.stock_notification_recipients TO service_role USING(true) WITH CHECK(true);
CREATE INDEX stock_recipients_due ON public.stock_notification_recipients(status,next_attempt_at);
CREATE TRIGGER stock_recipients_updated BEFORE UPDATE ON public.stock_notification_recipients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE FUNCTION public.stock_notification_audience_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.kind IN ('new','restock','low','out','removed') THEN
 INSERT INTO public.stock_notification_recipients(event_id,telegram_id) SELECT NEW.id,telegram_id FROM public.bot_users WHERE NOT is_banned AND telegram_id>0 AND contact_status NOT IN ('blocked','deactivated','stopped') ON CONFLICT DO NOTHING;
 END IF; RETURN NEW; END $$;
CREATE TRIGGER stock_notification_audience AFTER INSERT ON public.stock_notification_events FOR EACH ROW EXECUTE FUNCTION public.stock_notification_audience_trg();
CREATE FUNCTION public.claim_stock_notification_recipients() RETURNS TABLE(event_id uuid,telegram_id bigint,message jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
 RETURN QUERY WITH picked AS (SELECT r.event_id,r.telegram_id FROM public.stock_notification_recipients r JOIN public.stock_notification_events e ON e.id=r.event_id WHERE e.status='delivered' AND e.audience_message IS NOT NULL AND ((r.status IN ('pending','retry') AND r.next_attempt_at<=now()) OR (r.status='sending' AND r.claimed_at<now()-interval '60 seconds')) ORDER BY r.next_attempt_at,r.created_at,r.telegram_id LIMIT 10 FOR UPDATE OF r SKIP LOCKED), updated AS (UPDATE public.stock_notification_recipients r SET status='sending',claimed_at=now() FROM picked p WHERE r.event_id=p.event_id AND r.telegram_id=p.telegram_id RETURNING r.event_id,r.telegram_id) SELECT u.event_id,u.telegram_id,e.audience_message FROM updated u JOIN public.stock_notification_events e ON e.id=u.event_id;
 END $$;
REVOKE ALL ON FUNCTION public.claim_stock_notification_recipients() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stock_notification_recipients() TO service_role;
CREATE FUNCTION public.product_removed_notification_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF OLD.is_active AND (TG_OP='DELETE' OR NEW.is_active=false) AND OLD.owner_reseller_id IS NULL THEN
 INSERT INTO public.stock_notification_events(event_key,product_id,kind,source,product_snapshot) VALUES ('removed:'||OLD.id||':'||OLD.updated_at,OLD.id,'removed','admin_remove',jsonb_build_object('id',OLD.id,'name',OLD.name,'emoji',OLD.emoji,'telegram_custom_emoji_id',OLD.telegram_custom_emoji_id,'supplier_id',OLD.supplier_id)) ON CONFLICT DO NOTHING;
 END IF; RETURN OLD; END $$;
CREATE TRIGGER product_removed_notification BEFORE DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.product_removed_notification_trg();
CREATE TRIGGER product_disabled_notification AFTER UPDATE OF is_active ON public.products FOR EACH ROW WHEN (OLD.is_active AND NOT NEW.is_active) EXECUTE FUNCTION public.product_removed_notification_trg();
CREATE FUNCTION public.stock_counter_notification_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE threshold integer; kind text; cycle text; BEGIN
 IF NEW.available>=OLD.available OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=NEW.product_id AND is_active AND supplier_id IS NULL AND owner_reseller_id IS NULL) THEN RETURN NEW; END IF;
 SELECT greatest(0,coalesce(nullif(value,'')::integer,5)) INTO threshold FROM public.bot_settings WHERE key='announce_low_threshold'; threshold:=coalesce(threshold,5);
 IF OLD.available>0 AND NEW.available=0 THEN kind:='out'; ELSIF OLD.available>threshold AND NEW.available>0 AND NEW.available<=threshold THEN kind:='low'; END IF;
 IF kind IS NOT NULL THEN SELECT coalesce((SELECT id::text FROM public.stock_notification_events WHERE product_id=NEW.product_id AND stock_notification_events.kind='restock' ORDER BY created_at DESC LIMIT 1),'initial') INTO cycle;
 INSERT INTO public.stock_notification_events(event_key,product_id,kind,source,stock) VALUES(kind||':inhouse:'||NEW.product_id||':'||cycle,NEW.product_id,kind,'inhouse_counter',NEW.available) ON CONFLICT DO NOTHING; END IF; RETURN NEW; END $$;
CREATE TRIGGER stock_counter_notification AFTER UPDATE OF available ON public.stock_counters FOR EACH ROW EXECUTE FUNCTION public.stock_counter_notification_trg();
REVOKE ALL ON FUNCTION public.stock_notification_audience_trg(),public.product_removed_notification_trg(),public.stock_counter_notification_trg() FROM PUBLIC,anon,authenticated;