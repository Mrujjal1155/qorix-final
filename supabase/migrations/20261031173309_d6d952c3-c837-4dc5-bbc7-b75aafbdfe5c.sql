DO $$
DECLARE pid uuid; eid uuid; customer_count bigint; actual_count bigint; kind text; summary jsonb;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
    SELECT count(*) INTO customer_count FROM public.bot_users WHERE NOT is_banned AND telegram_id>0 AND contact_status NOT IN ('blocked','deactivated','stopped');
    INSERT INTO public.products(name,price,delivery_type,is_active,customer_alerts_enabled) VALUES ('Transactional alert rule test',1,'auto',true,false) RETURNING id INTO pid;
    FOREACH kind IN ARRAY ARRAY['new','restock','low','out','removed','price','flash','flash_end'] LOOP
      INSERT INTO public.stock_notification_events(event_key,product_id,kind,source) VALUES ('test:off:'||kind||':'||pid,pid,kind,'test') RETURNING id INTO eid;
      SELECT count(*) INTO actual_count FROM public.stock_notification_recipients WHERE event_id=eid;
      IF actual_count<>0 THEN RAISE EXCEPTION 'Off product unexpectedly created customer recipients'; END IF;
    END LOOP;
    UPDATE public.products SET customer_alerts_enabled=true WHERE id=pid;
    FOREACH kind IN ARRAY ARRAY['new','restock','low','out','removed','price','flash','flash_end'] LOOP
      INSERT INTO public.stock_notification_events(event_key,product_id,kind,source) VALUES ('test:on:'||kind||':'||pid,pid,kind,'test') RETURNING id INTO eid;
      SELECT count(*) INTO actual_count FROM public.stock_notification_recipients WHERE event_id=eid;
      IF actual_count<>customer_count THEN RAISE EXCEPTION 'Enabled notice missed contactable customers'; END IF;
    END LOOP;
    UPDATE public.stock_notification_events SET status='delivered',audience_message='{"text":"test"}' WHERE id=eid;
    INSERT INTO public.stock_notification_recipients(event_id,telegram_id,status) VALUES(eid,-1,'sent'),(eid,-2,'pending');
    summary:=public.admin_cancel_pending_alerts(eid);
    IF NOT EXISTS(SELECT 1 FROM public.stock_notification_recipients WHERE event_id=eid AND telegram_id=-1 AND status='sent') THEN RAISE EXCEPTION 'Cancellation changed sent history'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.stock_notification_recipients WHERE event_id=eid AND telegram_id=-2 AND status='cancelled') THEN RAISE EXCEPTION 'Cancellation left recipient waiting'; END IF;
    IF EXISTS(SELECT 1 FROM public.active_stock_notification_claims(ARRAY[eid],ARRAY[-2::bigint])) THEN RAISE EXCEPTION 'Cancelled claim still sendable'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.stock_notification_events WHERE id=eid AND status='delivered') THEN RAISE EXCEPTION 'Cancellation changed delivered event'; END IF;
    RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='rollback synthetic alert tests';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
  END;
END $$;