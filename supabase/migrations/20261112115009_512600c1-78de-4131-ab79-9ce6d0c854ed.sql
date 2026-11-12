CREATE OR REPLACE FUNCTION public.save_special_price_notice(_kind text, _target text, _product_id uuid, _price numeric, _min_qty integer, _message jsonb, _admin_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_price numeric; old_qty integer; recipient bigint; eid uuid; changed boolean; reachable boolean; baseline numeric;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_admin_id,'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF _kind NOT IN ('user','reseller') OR _price IS NULL OR _price<0 OR _price>100000 OR _min_qty IS NULL OR _min_qty<1 OR _min_qty>10000 OR _message->>'kind' IS DISTINCT FROM 'special_price' OR coalesce(_message->>'text','')='' OR length(_message->>'text')>4096 THEN RAISE EXCEPTION 'Invalid special price'; END IF;
SELECT price INTO baseline FROM public.products WHERE id=_product_id;
IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('special-price:'||_kind||':'||_target||':'||_product_id::text,0));
IF _kind='user' THEN
recipient:=_target::bigint;
SELECT price,min_qty INTO old_price,old_qty FROM public.user_product_prices WHERE telegram_id=recipient AND product_id=_product_id;
changed:=NOT FOUND OR old_price IS DISTINCT FROM _price OR old_qty IS DISTINCT FROM _min_qty;
INSERT INTO public.user_product_prices(telegram_id,product_id,price,min_qty) VALUES(recipient,_product_id,_price,_min_qty) ON CONFLICT(telegram_id,product_id) DO UPDATE SET price=EXCLUDED.price,min_qty=EXCLUDED.min_qty,updated_at=now();
ELSE
SELECT telegram_id INTO recipient FROM public.resellers WHERE id=_target::uuid AND is_active;
SELECT price,min_qty INTO old_price,old_qty FROM public.reseller_product_prices WHERE reseller_id=_target::uuid AND product_id=_product_id;
changed:=NOT FOUND OR old_price IS DISTINCT FROM _price OR old_qty IS DISTINCT FROM _min_qty;
INSERT INTO public.reseller_product_prices(reseller_id,product_id,price,min_qty) VALUES(_target::uuid,_product_id,_price,_min_qty) ON CONFLICT(reseller_id,product_id) DO UPDATE SET price=EXCLUDED.price,min_qty=EXCLUDED.min_qty,updated_at=now();
END IF;
IF NOT changed THEN RETURN jsonb_build_object('ok',true,'notice','unchanged'); END IF;
IF _kind='user' AND _price>=baseline THEN RETURN jsonb_build_object('ok',true,'notice','not_applicable'); END IF;
SELECT EXISTS(SELECT 1 FROM public.bot_users WHERE telegram_id=recipient AND telegram_id>0 AND NOT is_banned AND contact_status NOT IN ('blocked','deactivated','stopped')) INTO reachable;
IF NOT reachable THEN RETURN jsonb_build_object('ok',true,'notice','unreachable'); END IF;
INSERT INTO public.stock_notification_events(event_key,kind,source,status,delivered_at,audience_message,product_snapshot) VALUES('special-price:'||gen_random_uuid()::text,'broadcast','special_price','delivered',now(),_message,jsonb_build_object('name','Personal special price')) RETURNING id INTO eid;
INSERT INTO public.stock_notification_recipients(event_id,telegram_id) VALUES(eid,recipient);
RETURN jsonb_build_object('ok',true,'notice','queued');
END $$;
REVOKE ALL ON FUNCTION public.save_special_price_notice(text,text,uuid,numeric,integer,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_special_price_notice(text,text,uuid,numeric,integer,jsonb,uuid) TO service_role;