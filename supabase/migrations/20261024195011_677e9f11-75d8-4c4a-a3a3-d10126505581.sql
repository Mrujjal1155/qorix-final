CREATE OR REPLACE FUNCTION public.admin_bot_user_stats() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('total',count(*),'banned',count(*) FILTER (WHERE is_banned),'not_banned',count(*) FILTER (WHERE NOT is_banned),'balance',coalesce(sum(balance),0),'blocked',count(*) FILTER (WHERE contact_status='blocked'),'reachable',count(*) FILTER (WHERE contact_status='reachable'),'deactivated',count(*) FILTER (WHERE contact_status='deactivated'),'stopped',count(*) FILTER (WHERE contact_status='stopped'),'unknown',count(*) FILTER (WHERE contact_status='unknown')) FROM public.bot_users);
END $$;
CREATE OR REPLACE FUNCTION public.record_bot_contact(_telegram_id bigint, _status text, _observed_at timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF _status IS NULL OR _status NOT IN ('reachable','blocked','deactivated','stopped') OR _observed_at IS NULL THEN RAISE EXCEPTION 'Invalid contact evidence'; END IF;
 UPDATE public.bot_users SET contact_status=_status,contact_status_at=_observed_at WHERE telegram_id=_telegram_id AND (contact_status_at IS NULL OR contact_status_at < _observed_at);
END $$;