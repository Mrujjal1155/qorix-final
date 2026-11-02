BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ DECLARE first_job jsonb; second_job jsonb; expected bigint; actual bigint; uid bigint; before_state jsonb; after_state jsonb; BEGIN
 SELECT count(*) INTO expected FROM public.bot_users WHERE NOT is_banned AND telegram_id>0 AND contact_status NOT IN ('blocked','deactivated','stopped');
 first_job:=public.enqueue_bot_broadcast('broadcast:transactional-rule-test',jsonb_build_object('kind','broadcast','text','<literal> & Premium','entities',jsonb_build_array(jsonb_build_object('type','custom_emoji','offset',0,'length',2,'custom_emoji_id','5204116184986844054'))));
 second_job:=public.enqueue_bot_broadcast('broadcast:transactional-rule-test',jsonb_build_object('kind','broadcast','text','must not replace','entities','[]'::jsonb));
 IF first_job->>'id' IS DISTINCT FROM second_job->>'id' OR (first_job->>'total')::bigint<>expected THEN RAISE EXCEPTION 'Audience or idempotency failed'; END IF;
 SELECT count(*) INTO actual FROM public.stock_notification_recipients WHERE event_id=(first_job->>'id')::uuid;
 IF actual<>expected THEN RAISE EXCEPTION 'Recipient rows mismatch'; END IF;
 IF (SELECT audience_message->>'text' FROM public.stock_notification_events WHERE id=(first_job->>'id')::uuid) IS DISTINCT FROM '<literal> & Premium' THEN RAISE EXCEPTION 'Content overwritten'; END IF;
 SELECT telegram_id,state INTO uid,before_state FROM public.bot_users ORDER BY telegram_id LIMIT 1;
 IF uid IS NOT NULL THEN
  UPDATE public.bot_users SET state=jsonb_build_object('awaiting','broadcast','msgs','[]'::jsonb,'other','keep') WHERE telegram_id=uid;
  PERFORM public.track_bot_message(uid,123);
  SELECT state INTO after_state FROM public.bot_users WHERE telegram_id=uid;
  IF after_state->>'awaiting' IS DISTINCT FROM 'broadcast' OR after_state->>'other' IS DISTINCT FROM 'keep' OR after_state->'msgs' IS DISTINCT FROM '[123]'::jsonb THEN RAISE EXCEPTION 'Pending state overwritten'; END IF;
 END IF;
END $$;
ROLLBACK;