DROP FUNCTION public.review_vendor_application(uuid,boolean,text);
CREATE FUNCTION public.review_vendor_application(p_id uuid,p_approve boolean,p_admin_id uuid,p_note text DEFAULT '')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.vendor_applications; v_status text;
BEGIN
 IF p_admin_id IS NULL OR NOT public.has_role(p_admin_id,'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'Note too long'; END IF;
 SELECT * INTO v_row FROM public.vendor_applications WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
 IF v_row.status<>'pending' THEN RETURN v_row.status; END IF;
 v_status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
 IF p_approve AND v_row.kind='application' THEN
 INSERT INTO public.approved_vendors(telegram_id,application_id) VALUES(v_row.telegram_id,v_row.id) ON CONFLICT(telegram_id) DO UPDATE SET application_id=excluded.application_id,is_active=true;
 ELSIF p_approve AND v_row.kind='supply' AND NOT EXISTS(SELECT 1 FROM public.approved_vendors WHERE telegram_id=v_row.telegram_id AND is_active) THEN RAISE EXCEPTION 'Vendor approval required'; END IF;
 UPDATE public.vendor_applications SET status=v_status,admin_note=coalesce(p_note,''),reviewed_by=p_admin_id,reviewed_at=now() WHERE id=p_id;
 RETURN v_status;
END; $$;
REVOKE ALL ON FUNCTION public.review_vendor_application(uuid,boolean,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_vendor_application(uuid,boolean,uuid,text) TO service_role;
CREATE INDEX approved_vendors_application ON public.approved_vendors(application_id);