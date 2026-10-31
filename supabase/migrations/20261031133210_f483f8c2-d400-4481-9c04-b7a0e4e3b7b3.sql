CREATE OR REPLACE FUNCTION public.record_bybit_website_check(_order_id uuid,_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
UPDATE public.orders SET meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('bybit',jsonb_build_object('status','not_found','checked_at',now(),'note',left(_note,300))) WHERE id=_order_id AND source='website' AND payment_method='bybit' AND status='pending' AND NOT coalesce((meta->>'paid')::boolean,false);
END $$;
REVOKE ALL ON FUNCTION public.record_bybit_website_check(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_bybit_website_check(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.guard_bybit_credit_deadline() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
IF OLD.kind='bybit' AND OLD.status IS DISTINCT FROM 'credited' AND NEW.status='credited' AND (OLD.status<>'pending' OR OLD.expires_at<=now()) THEN RAISE EXCEPTION 'Bybit deposit expired'; END IF;
RETURN NEW; END $$;
CREATE TRIGGER guard_bybit_credit_deadline BEFORE UPDATE ON public.binance_deposits FOR EACH ROW EXECUTE FUNCTION public.guard_bybit_credit_deadline();