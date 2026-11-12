CREATE OR REPLACE FUNCTION public.remove_special_price_notice(_kind text, _id uuid, _target text, _product_id uuid, _expected_price numeric, _expected_min_qty integer, _message jsonb, _admin_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE saved record; recipient bigint; eid uuid; reachable boolean;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_admin_id,'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF _kind IS NULL OR _kind NOT IN ('user','reseller') OR _target IS NULL OR _product_id IS NULL OR _expected_price IS NULL OR _expected_min_qty IS NULL OR _message->>'kind' IS DISTINCT FROM 'special_price_removed' OR coalesce(_message->>'text','')='' OR length(_message->>'text')>4096 THEN RAISE EXCEPTION 'Invalid removal notice'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('special-price:'||_kind||':'||_target||':'||_product_id::text,0));
IF _kind='user' THEN
SELECT * INTO saved FROM public.user_product_prices WHERE id=_id FOR UPDATE;
IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'notice','unchanged'); END IF;
IF saved.telegram_id::text IS DISTINCT FROM _target OR saved.product_id IS DISTINCT FROM _product_id OR saved.price IS DISTINCT FROM _expected_price OR saved.min_qty IS DISTINCT FROM _expected_min_qty THEN RAISE EXCEPTION 'Special price changed; refresh before removing'; END IF;
recipient:=saved.telegram_id;
DELETE FROM public.user_product_prices WHERE id=_id;
ELSE
SELECT * INTO saved FROM public.reseller_product_prices WHERE id=_id FOR UPDATE;
IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'notice','unchanged'); END IF;
IF saved.reseller_id::text IS DISTINCT FROM _target OR saved.product_id IS DISTINCT FROM _product_id OR saved.price IS DISTINCT FROM _expected_price OR saved.min_qty IS DISTINCT FROM _expected_min_qty THEN RAISE EXCEPTION 'Special price changed; refresh before removing'; END IF;
SELECT telegram_id INTO recipient FROM public.resellers WHERE id=saved.reseller_id AND is_active;
DELETE FROM public.reseller_product_prices WHERE id=_id;
END IF;
SELECT EXISTS(SELECT 1 FROM public.bot_users WHERE telegram_id=recipient AND telegram_id>0 AND NOT is_banned AND contact_status NOT IN ('blocked','deactivated','stopped')) INTO reachable;
IF NOT reachable THEN RETURN jsonb_build_object('ok',true,'notice','unreachable'); END IF;
INSERT INTO public.stock_notification_events(event_key,kind,source,status,delivered_at,audience_message,product_snapshot) VALUES('special-price-removed:'||gen_random_uuid()::text,'broadcast','special_price','delivered',now(),_message,jsonb_build_object('name','Personal special price removed')) RETURNING id INTO eid;
INSERT INTO public.stock_notification_recipients(event_id,telegram_id) VALUES(eid,recipient);
RETURN jsonb_build_object('ok',true,'notice','queued');
END $$;
REVOKE ALL ON FUNCTION public.remove_special_price_notice(text,uuid,text,uuid,numeric,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remove_special_price_notice(text,uuid,text,uuid,numeric,integer,jsonb,uuid) TO service_role;