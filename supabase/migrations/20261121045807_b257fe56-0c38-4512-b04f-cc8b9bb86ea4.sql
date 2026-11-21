CREATE TABLE public.vendor_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE,
 telegram_id bigint NOT NULL, applicant_name text NOT NULL, username text,
 kind text NOT NULL DEFAULT 'application', mode text NOT NULL, products jsonb NOT NULL,
 contact_note text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'pending', admin_note text NOT NULL DEFAULT '',
 reviewed_by uuid, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vendor_applications TO authenticated;
GRANT ALL ON public.vendor_applications TO service_role;
ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_applications_admin_read ON public.vendor_applications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX vendor_applications_recent ON public.vendor_applications(created_at DESC, id DESC);
CREATE TABLE public.approved_vendors (
 telegram_id bigint PRIMARY KEY, application_id uuid NOT NULL REFERENCES public.vendor_applications(id), is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.approved_vendors TO authenticated;
GRANT ALL ON public.approved_vendors TO service_role;
ALTER TABLE public.approved_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY approved_vendors_admin_read ON public.approved_vendors FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER vendor_applications_updated BEFORE UPDATE ON public.vendor_applications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER approved_vendors_updated BEFORE UPDATE ON public.approved_vendors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE FUNCTION public.submit_vendor_application(p_request_id uuid, p_telegram_id bigint, p_kind text, p_mode text, p_products jsonb, p_contact_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user public.bot_users; v_id uuid; v_product jsonb; v_key text;
BEGIN
 SELECT * INTO v_user FROM public.bot_users WHERE telegram_id=p_telegram_id FOR UPDATE;
 IF NOT FOUND OR v_user.is_banned THEN RAISE EXCEPTION 'Applicant unavailable'; END IF;
 SELECT id INTO v_id FROM public.vendor_applications WHERE request_id=p_request_id AND telegram_id=p_telegram_id;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 IF p_kind NOT IN ('application','supply') OR p_mode NOT IN ('single','multiple') THEN RAISE EXCEPTION 'Invalid application'; END IF;
 IF p_kind='supply' AND NOT EXISTS(SELECT 1 FROM public.approved_vendors WHERE telegram_id=p_telegram_id AND is_active) THEN RAISE EXCEPTION 'Vendor approval required'; END IF;
 IF p_kind='application' AND EXISTS(SELECT 1 FROM public.vendor_applications WHERE telegram_id=p_telegram_id AND kind='application' AND status='pending') THEN RAISE EXCEPTION 'Application already pending'; END IF;
 IF jsonb_typeof(p_products) IS DISTINCT FROM 'array' OR jsonb_array_length(p_products) NOT BETWEEN 1 AND 20 OR (p_mode='single' AND jsonb_array_length(p_products)<>1) OR length(coalesce(p_contact_note,''))>1000 THEN RAISE EXCEPTION 'Invalid products'; END IF;
 FOR v_product IN SELECT value FROM jsonb_array_elements(p_products) LOOP
  FOREACH v_key IN ARRAY ARRAY['name','duration','warranty','price','stock','capacity'] LOOP
   IF jsonb_typeof(v_product->v_key) IS DISTINCT FROM 'string' OR length(btrim(v_product->>v_key)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Incomplete product'; END IF;
  END LOOP;
  IF jsonb_typeof(v_product->'details') IS DISTINCT FROM 'string' OR length(v_product->>'details')>500 THEN RAISE EXCEPTION 'Invalid details'; END IF;
 END LOOP;
 INSERT INTO public.vendor_applications(request_id,telegram_id,applicant_name,username,kind,mode,products,contact_note)
 VALUES(p_request_id,p_telegram_id,btrim(concat_ws(' ',v_user.first_name,v_user.last_name)),v_user.username,p_kind,p_mode,p_products,coalesce(p_contact_note,'')) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.submit_vendor_application(uuid,bigint,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_vendor_application(uuid,bigint,text,text,jsonb,text) TO service_role;
CREATE OR REPLACE FUNCTION public.review_vendor_application(p_id uuid,p_approve boolean,p_note text DEFAULT '')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.vendor_applications; v_status text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF length(coalesce(p_note,''))>1000 THEN RAISE EXCEPTION 'Note too long'; END IF;
 SELECT * INTO v_row FROM public.vendor_applications WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
 IF v_row.status<>'pending' THEN RETURN v_row.status; END IF;
 v_status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
 IF p_approve AND v_row.kind='application' THEN
  INSERT INTO public.approved_vendors(telegram_id,application_id) VALUES(v_row.telegram_id,v_row.id)
  ON CONFLICT(telegram_id) DO UPDATE SET application_id=excluded.application_id,is_active=true;
 ELSIF p_approve AND v_row.kind='supply' AND NOT EXISTS(SELECT 1 FROM public.approved_vendors WHERE telegram_id=v_row.telegram_id AND is_active) THEN
  RAISE EXCEPTION 'Vendor approval required';
 END IF;
 UPDATE public.vendor_applications SET status=v_status,admin_note=coalesce(p_note,''),reviewed_by=auth.uid(),reviewed_at=now() WHERE id=p_id;
 RETURN v_status;
END; $$;
REVOKE ALL ON FUNCTION public.review_vendor_application(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_vendor_application(uuid,boolean,text) TO authenticated;
