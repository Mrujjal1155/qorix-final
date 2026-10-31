ALTER TABLE public.products ADD COLUMN customer_alerts_enabled boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.stock_notification_audience_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.kind IN ('new','restock','low','out','removed','price','flash','flash_end') AND coalesce((SELECT customer_alerts_enabled FROM public.products WHERE id=NEW.product_id),(NEW.product_snapshot->>'customer_alerts_enabled')::boolean,false) THEN
 INSERT INTO public.stock_notification_recipients(event_id,telegram_id) SELECT NEW.id,telegram_id FROM public.bot_users WHERE NOT is_banned AND telegram_id>0 AND contact_status NOT IN ('blocked','deactivated','stopped') ON CONFLICT DO NOTHING;
 END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.product_removed_notification_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF OLD.is_active AND (TG_OP='DELETE' OR NEW.is_active=false) AND OLD.owner_reseller_id IS NULL THEN
 INSERT INTO public.stock_notification_events(event_key,product_id,kind,source,product_snapshot) VALUES ('removed:'||OLD.id||':'||OLD.updated_at,OLD.id,'removed','admin_remove',jsonb_build_object('id',OLD.id,'name',OLD.name,'emoji',OLD.emoji,'telegram_custom_emoji_id',OLD.telegram_custom_emoji_id,'supplier_id',OLD.supplier_id,'customer_alerts_enabled',OLD.customer_alerts_enabled)) ON CONFLICT DO NOTHING;
 END IF; RETURN OLD; END $$;
CREATE OR REPLACE FUNCTION public.admin_alert_queue(_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE result jsonb; BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 WITH counts AS (SELECT status,count(*) n FROM public.stock_notification_recipients WHERE status IN ('pending','retry','sending') GROUP BY status), events AS (SELECT kind,count(*) n FROM public.stock_notification_events WHERE status IN ('pending','retry','sending','processing','failed') GROUP BY kind)
 SELECT jsonb_build_object('pendingRecipients',coalesce((SELECT sum(n) FROM counts),0),'pendingEvents',coalesce((SELECT sum(n) FROM events),0),'byKind',coalesce((SELECT jsonb_object_agg(kind,n) FROM events),'{}'::jsonb)) INTO result;
 RETURN result || jsonb_build_object('checkedAt',now(),'items',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (
 SELECT e.id,coalesce(p.name,e.product_snapshot->>'name','Unknown product') AS product_name,e.kind,e.source,e.status,e.created_at,e.last_error,e.old_price,e.new_price,
 (SELECT count(*) FROM public.stock_notification_recipients r WHERE r.event_id=e.id AND r.status IN ('pending','retry','sending')) AS waiting,
 (SELECT count(*) FROM public.stock_notification_recipients r WHERE r.event_id=e.id AND r.status='sent') AS sent
 FROM public.stock_notification_events e LEFT JOIN public.products p ON p.id=e.product_id
 WHERE e.status IN ('pending','retry','sending','processing','failed') OR EXISTS(SELECT 1 FROM public.stock_notification_recipients r WHERE r.event_id=e.id AND r.status IN ('pending','retry','sending'))
 ORDER BY e.created_at,e.id LIMIT 50 OFFSET greatest(0,_offset)) q),'[]'::jsonb),
 'totalItems',(SELECT count(*) FROM public.stock_notification_events e WHERE e.status IN ('pending','retry','sending','processing','failed') OR EXISTS(SELECT 1 FROM public.stock_notification_recipients r WHERE r.event_id=e.id AND r.status IN ('pending','retry','sending')))); END $$;
CREATE OR REPLACE FUNCTION public.admin_cancel_pending_alerts(_event_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE nr integer; ne integer; BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 PERFORM 1 FROM public.stock_notification_dispatch WHERE id=true FOR UPDATE;
 PERFORM 1 FROM public.stock_notification_events e WHERE (_event_id IS NULL OR e.id=_event_id) AND (e.status IN ('pending','retry','sending','processing','failed') OR EXISTS(SELECT 1 FROM public.stock_notification_recipients r WHERE r.event_id=e.id AND r.status IN ('pending','retry','sending'))) ORDER BY e.id FOR UPDATE;
 UPDATE public.stock_notification_events SET status='cancelled',claimed_at=NULL,last_error='Cancelled by admin' WHERE (_event_id IS NULL OR id=_event_id) AND status IN ('pending','retry','sending','processing','failed'); GET DIAGNOSTICS ne=ROW_COUNT;
 UPDATE public.stock_notification_recipients SET status='cancelled',claimed_at=NULL,last_error='Cancelled by admin' WHERE (_event_id IS NULL OR event_id=_event_id) AND status IN ('pending','retry','sending'); GET DIAGNOSTICS nr=ROW_COUNT;
 RETURN jsonb_build_object('recipients',nr,'events',ne); END $$;
CREATE OR REPLACE FUNCTION public.active_stock_notification_claims(_event_ids uuid[],_telegram_ids bigint[]) RETURNS TABLE(event_id uuid,telegram_id bigint) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT r.event_id,r.telegram_id FROM public.stock_notification_recipients r JOIN unnest(_event_ids,_telegram_ids) p(event_id,telegram_id) ON r.event_id=p.event_id AND r.telegram_id=p.telegram_id WHERE auth.role()='service_role' AND r.status='sending'; $$;
REVOKE ALL ON FUNCTION public.stock_notification_audience_trg(),public.product_removed_notification_trg(),public.admin_alert_queue(integer),public.admin_cancel_pending_alerts(uuid),public.active_stock_notification_claims(uuid[],bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_alert_queue(integer),public.admin_cancel_pending_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.active_stock_notification_claims(uuid[],bigint[]) TO service_role;