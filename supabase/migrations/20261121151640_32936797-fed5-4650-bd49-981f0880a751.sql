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
 AND public.payment_order_is_paid(NEW.meta) IS TRUE
 AND (TG_OP='INSERT' OR public.payment_order_is_paid(OLD.meta) IS NOT TRUE) THEN
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
REVOKE ALL ON FUNCTION public.live_update_orders_trg() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.live_update_orders_trg() TO service_role;