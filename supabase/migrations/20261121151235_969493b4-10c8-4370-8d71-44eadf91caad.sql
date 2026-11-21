ALTER TABLE public.live_update_events ADD COLUMN live_sent boolean NOT NULL DEFAULT false, ADD COLUMN general_sent boolean NOT NULL DEFAULT false, ADD COLUMN general_enabled boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.live_update_enqueue(_kind text, _ref text, _payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.live_update_events(kind,ref,payload,general_enabled)
 VALUES(_kind,_ref,_payload,_kind IN ('topup','payment') OR (_kind='purchase' AND _payload->>'source'='website'))
 ON CONFLICT(ref) DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
REVOKE ALL ON FUNCTION public.live_update_enqueue(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.live_update_enqueue(text,text,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.live_update_orders_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _name text; _uid text;
BEGIN
 IF NEW.telegram_id>0 THEN
  SELECT coalesce(first_name,username) INTO _name FROM public.bot_users WHERE telegram_id=NEW.telegram_id;
 END IF;
 _name:=coalesce(_name,NEW.customer_name,'');
 _uid:=CASE WHEN NEW.telegram_id>0 THEN NEW.telegram_id::text ELSE coalesce(NEW.user_id::text,NEW.reseller_id::text,NEW.order_no::text) END;
 IF NEW.source='website' AND NEW.reseller_id IS NULL
 AND coalesce(NEW.payment_method,'') NOT IN ('wallet','balance','reseller_balance')
 AND public.payment_order_is_paid(NEW.meta)
 AND (TG_OP='INSERT' OR NOT public.payment_order_is_paid(OLD.meta)) THEN
  PERFORM public.live_update_enqueue('payment','payment:'||NEW.id,jsonb_build_object(
   'uid',_uid,'name',_name,'product',NEW.product_name,'qty',NEW.quantity,
   'method',coalesce(NEW.payment_method,''),'source',NEW.source));
 END IF;
 IF NEW.status='completed' AND NEW.source IN ('telegram','website','api_bot','api_website')
 AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
  PERFORM public.live_update_enqueue('purchase','order:'||NEW.id,jsonb_build_object(
   'uid',_uid,'name',_name,'product',NEW.product_name,'qty',NEW.quantity,
   'method',coalesce(NEW.payment_method,''),'source',NEW.source));
 END IF;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS live_update_orders ON public.orders;
CREATE TRIGGER live_update_orders AFTER INSERT OR UPDATE OF status,meta ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.live_update_orders_trg();
REVOKE ALL ON FUNCTION public.live_update_orders_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.live_update_orders_trg() TO service_role;