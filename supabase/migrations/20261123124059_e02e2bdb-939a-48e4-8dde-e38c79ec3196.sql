CREATE OR REPLACE FUNCTION public.enqueue_product_list_routed(_event_key text, _message jsonb, _groups bigint[], _include_users boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE eid uuid; n bigint; BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF _event_key NOT LIKE 'broadcast:product-list:%' OR _message->>'kind' IS DISTINCT FROM 'product_list' OR coalesce(_message->>'text','')='' OR octet_length(_message->>'text')>32768 OR cardinality(_groups)>100 THEN RAISE EXCEPTION 'Invalid product list'; END IF;
INSERT INTO public.stock_notification_events(event_key,kind,source,status,delivered_at,audience_message,product_snapshot) VALUES(_event_key,'broadcast','admin_product_list','delivered',now(),_message,jsonb_build_object('name','Product list broadcast')) ON CONFLICT(event_key) DO NOTHING RETURNING id INTO eid;
IF eid IS NULL THEN SELECT id INTO eid FROM public.stock_notification_events WHERE event_key=_event_key;
ELSE
  IF _include_users THEN INSERT INTO public.stock_notification_recipients(event_id,telegram_id) SELECT eid,telegram_id FROM public.bot_users WHERE NOT is_banned AND telegram_id>0 AND contact_status NOT IN ('blocked','deactivated','stopped') ON CONFLICT DO NOTHING; END IF;
  INSERT INTO public.stock_notification_recipients(event_id,telegram_id) SELECT eid,g FROM unnest(_groups) g WHERE g<0 ON CONFLICT DO NOTHING;
END IF;
SELECT count(*) INTO n FROM public.stock_notification_recipients WHERE event_id=eid; RETURN jsonb_build_object('id',eid,'total',n); END $$;
REVOKE ALL ON FUNCTION public.enqueue_product_list_routed(text,jsonb,bigint[],boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_product_list_routed(text,jsonb,bigint[],boolean) TO service_role;