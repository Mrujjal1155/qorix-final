CREATE OR REPLACE FUNCTION public.enqueue_bot_broadcast(_event_key text, _message jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE eid uuid; n bigint; BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _event_key IS NULL OR _event_key NOT LIKE 'broadcast:%' OR _message->>'kind' IS DISTINCT FROM 'broadcast' OR coalesce(_message->>'text','')='' AND coalesce(_message->>'photo','')='' THEN RAISE EXCEPTION 'Invalid broadcast'; END IF;
 INSERT INTO public.stock_notification_events(event_key,product_id,kind,source,status,delivered_at,audience_message,product_snapshot) VALUES(_event_key,NULL,'broadcast','telegram_admin','delivered',now(),_message,jsonb_build_object('name','Admin broadcast')) ON CONFLICT(event_key) DO NOTHING RETURNING id INTO eid;
 IF eid IS NULL THEN SELECT id INTO eid FROM public.stock_notification_events WHERE event_key=_event_key;
 ELSE INSERT INTO public.stock_notification_recipients(event_id,telegram_id) SELECT eid,telegram_id FROM public.bot_users WHERE NOT is_banned AND telegram_id>0 AND contact_status NOT IN ('blocked','deactivated','stopped') ON CONFLICT DO NOTHING; END IF;
 SELECT count(*) INTO n FROM public.stock_notification_recipients WHERE event_id=eid;
 RETURN jsonb_build_object('id',eid,'total',n); END $$;
REVOKE ALL ON FUNCTION public.enqueue_bot_broadcast(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_bot_broadcast(text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.track_bot_message(_telegram_id bigint,_message_id bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 UPDATE public.bot_users SET state=jsonb_set(coalesce(state,'{}'::jsonb),'{msgs}',coalesce((SELECT jsonb_agg(v ORDER BY ord) FROM (SELECT v,ord FROM jsonb_array_elements(CASE WHEN jsonb_typeof(state->'msgs')='array' THEN state->'msgs' ELSE '[]'::jsonb END || jsonb_build_array(_message_id)) WITH ORDINALITY AS a(v,ord) ORDER BY ord DESC LIMIT 40) t),'[]'::jsonb),true) WHERE telegram_id=_telegram_id; END $$;
REVOKE ALL ON FUNCTION public.track_bot_message(bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.track_bot_message(bigint,bigint) TO service_role;