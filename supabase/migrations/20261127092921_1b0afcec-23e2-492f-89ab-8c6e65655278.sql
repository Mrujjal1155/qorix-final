ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY['pending','completed','cancelled','awaiting_payment','failed','refunded','credited']));

-- Linked profiles never keep a website balance: move it into the bot wallet.
CREATE OR REPLACE FUNCTION public.sweep_linked_profile_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE amt numeric;
BEGIN
  IF NEW.telegram_id IS NULL OR coalesce(NEW.wallet_balance,0) <= 0 THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bot_users WHERE telegram_id = NEW.telegram_id) THEN RETURN NEW; END IF;
  amt := round(NEW.wallet_balance, 2);
  PERFORM public.bot_user_credit(NEW.telegram_id, amt, 'deposit', 'website', 'web-wallet-merge:'||NEW.id||':'||extract(epoch from clock_timestamp()), 'Website wallet moved to bot wallet');
  NEW.wallet_balance := 0;
  INSERT INTO public.wallet_transactions (user_id, type, amount, balance_after, reference, note)
  VALUES (NEW.id, 'transfer', -amt, 0, 'bot:'||NEW.telegram_id, 'Moved to connected Telegram wallet');
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sweep_linked_profile_wallet() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_sweep_linked_profile_wallet BEFORE UPDATE OF wallet_balance, telegram_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sweep_linked_profile_wallet();

-- Website top-up orders: credit once, never treated as a sale.
CREATE OR REPLACE FUNCTION public.claim_website_fulfillment(_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders%ROWTYPE; p public.products%ROWTYPE; m jsonb; token uuid; tid bigint; ref text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
 m:=coalesce(o.meta,'{}'::jsonb);
 IF coalesce(m->>'wallet_topup','false')='true' THEN
  IF o.status='credited' THEN RETURN jsonb_build_object('status','manual'); END IF;
  IF o.source<>'website' OR o.user_id IS NULL OR o.status<>'pending' OR public.payment_order_is_paid(m) IS NOT TRUE OR coalesce(m->>'refunded','false')='true' OR coalesce(m->>'awaiting_payment','false')='true' THEN RETURN jsonb_build_object('status','ineligible'); END IF;
  ref:='web-topup:'||o.id;
  SELECT telegram_id INTO tid FROM public.profiles WHERE id=o.user_id FOR UPDATE;
  IF tid IS NOT NULL AND EXISTS(SELECT 1 FROM public.bot_users WHERE telegram_id=tid) THEN
   IF NOT EXISTS(SELECT 1 FROM public.transactions WHERE reference=ref) THEN
    PERFORM public.bot_user_credit(tid, o.total, 'deposit', coalesce(o.payment_method,'website'), ref, 'Website top-up');
   END IF;
  ELSE
   PERFORM public.profile_wallet_credit(o.user_id, o.total, 'deposit', ref, 'Website top-up · '||coalesce(o.payment_method,''));
  END IF;
  UPDATE public.orders SET status='credited', meta=m||jsonb_build_object('paid',true,'awaiting_payment',false,'topup_credited_at',clock_timestamp()), updated_at=clock_timestamp() WHERE id=o.id;
  RETURN jsonb_build_object('status','manual');
 END IF;
 IF o.source<>'website' OR o.reseller_id IS NOT NULL OR o.status<>'pending' OR nullif(btrim(o.delivered_content),'') IS NOT NULL OR public.payment_order_is_paid(m) IS NOT TRUE OR coalesce(m->>'refunded','false')='true' OR coalesce(m->>'awaiting_payment','false')='true' THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 SELECT * INTO p FROM public.products WHERE id=o.product_id FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','missing_product'); END IF;
 m:=m||jsonb_build_object('paid',true,'awaiting_payment',false,'website_fulfillment_checked_at',clock_timestamp());
 UPDATE public.orders SET meta=m,updated_at=clock_timestamp() WHERE id=o.id;
 IF p.delivery_type='manual' THEN
  IF coalesce(m->>'website_manual_reserved','false')='true' THEN RETURN jsonb_build_object('status','manual'); END IF;
  IF NOT public.take_manual_stock(p.id,o.quantity) THEN RETURN jsonb_build_object('status','out_of_stock'); END IF;
  UPDATE public.orders SET meta=m||jsonb_build_object('website_manual_reserved',true),updated_at=clock_timestamp() WHERE id=o.id;
  RETURN jsonb_build_object('status','manual');
 END IF;
 IF p.delivery_type<>'auto' THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 IF p.supplier_id IS NULL THEN RETURN jsonb_build_object('status','inhouse'); END IF;
 IF nullif(p.supplier_external_id,'') IS NULL OR m ? 'website_supplier_attempt' OR m ? 'wallet_supplier_attempt' OR m ? 'supplier_error' OR m ? 'insight_reference' THEN RETURN jsonb_build_object('status','review'); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p.supplier_id AND is_enabled) THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 token:=gen_random_uuid();
 UPDATE public.orders SET meta=m||jsonb_build_object('website_supplier_attempt',token,'website_supplier_state','processing','website_supplier_started_at',clock_timestamp()),updated_at=clock_timestamp() WHERE id=o.id;
 RETURN jsonb_build_object('status','supplier','token',token);
END $$;

CREATE OR REPLACE FUNCTION public.website_fulfillment_candidates(_limit integer DEFAULT 5)
RETURNS TABLE(id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT o.id FROM public.orders o LEFT JOIN public.products p ON p.id=o.product_id
 WHERE auth.role()='service_role' AND (p.delivery_type='auto' OR (o.product_id IS NULL AND o.meta->>'wallet_topup'='true'))
 AND o.source='website' AND o.reseller_id IS NULL AND o.status='pending' AND public.payment_order_is_paid(o.meta) IS TRUE AND coalesce(o.meta->>'refunded','false')<>'true' AND coalesce(o.meta->>'awaiting_payment','false')<>'true' AND NOT(coalesce(o.meta,'{}'::jsonb) ?| ARRAY['website_supplier_attempt','wallet_supplier_attempt','website_manual_reserved','supplier_error','insight_reference']) AND nullif(btrim(o.delivered_content),'') IS NULL AND coalesce((o.meta->>'website_fulfillment_checked_at')::timestamptz,'epoch'::timestamptz)<clock_timestamp()-interval '30 seconds' ORDER BY o.created_at LIMIT greatest(1,least(_limit,10));
$$;

-- Wallet purchase: connected → bot wallet (unchanged); email-only → website wallet.
CREATE OR REPLACE FUNCTION public.purchase_website_wallet(_user_id uuid, _product_id uuid, _qty integer, _request_id uuid, _expected_total numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.products%ROWTYPE; u public.bot_users%ROWTYPE; pr public.profiles%ROWTYPE; o public.orders%ROWTYPE; tid bigint; mail text; contents text[]; n integer; amount numeric; unit numeric; nm text;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF _user_id IS NULL OR _qty IS NULL OR _qty<1 OR _qty>100000 OR _request_id IS NULL THEN RAISE EXCEPTION 'Invalid request'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text||_request_id::text,0));
SELECT * INTO o FROM public.orders WHERE user_id=_user_id AND payment_method='wallet' AND meta->>'wallet_request_id'=_request_id::text;
IF FOUND THEN
IF o.product_id IS DISTINCT FROM _product_id OR o.quantity<>_qty THEN RAISE EXCEPTION 'Request already used'; END IF;
RETURN jsonb_build_object('id',o.id,'order_no',o.order_no,'email',o.customer_email,'changed',false);
END IF;
SELECT * INTO pr FROM public.profiles WHERE id=_user_id FOR UPDATE;
IF NOT FOUND OR coalesce(pr.is_banned,false) THEN RAISE EXCEPTION 'Wallet unavailable'; END IF;
tid:=nullif(pr.telegram_id,0); mail:=pr.email;
IF tid IS NOT NULL THEN
 SELECT * INTO u FROM public.bot_users WHERE telegram_id=tid FOR UPDATE;
 IF NOT FOUND OR coalesce(u.is_banned,false) THEN RAISE EXCEPTION 'Wallet unavailable'; END IF;
END IF;
SELECT * INTO p FROM public.products WHERE id=_product_id FOR SHARE;
IF NOT FOUND OR NOT p.is_active THEN RAISE EXCEPTION 'Product unavailable'; END IF;
unit:=public.website_bulk_unit(_product_id,_qty);
amount:=round(unit*_qty,2);
IF amount<=0 OR amount IS DISTINCT FROM _expected_total THEN RAISE EXCEPTION 'Price changed. Refresh checkout'; END IF;
IF (CASE WHEN tid IS NOT NULL THEN u.balance ELSE pr.wallet_balance END)<amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
IF p.supplier_id IS NOT NULL AND p.delivery_type<>'manual' THEN
IF coalesce(p.supplier_stock,0)<_qty OR NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p.supplier_id AND is_enabled) THEN RAISE EXCEPTION 'Stock unavailable'; END IF;
ELSIF p.delivery_type='auto' THEN
SELECT array_agg(s.content),count(*)::integer INTO contents,n FROM public.claim_stock_items(p.id,_qty,tid) s;
IF n<>_qty OR EXISTS(SELECT 1 FROM unnest(contents) c WHERE nullif(btrim(c),'') IS NULL) THEN RAISE EXCEPTION 'Stock unavailable'; END IF;
ELSIF p.manual_stock_limited THEN
IF public.take_manual_stock(p.id,_qty) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Stock unavailable'; END IF;
END IF;
IF tid IS NOT NULL THEN
 mail:=coalesce(nullif(mail,''),'tg'||tid||'@telegram.qorix.local');
 nm:=coalesce(nullif(u.first_name,''),'Telegram user');
ELSE
 IF nullif(mail,'') IS NULL THEN RAISE EXCEPTION 'Wallet unavailable'; END IF;
 nm:=coalesce(nullif(pr.full_name,''),'Customer');
END IF;
INSERT INTO public.orders(telegram_id,user_id,source,product_id,product_name,quantity,unit_price,total,status,delivery_type,customer_name,customer_email,payment_method,delivered_content,meta)
VALUES(coalesce(tid,0),_user_id,'website',p.id,p.name,_qty,unit,amount,CASE WHEN contents IS NULL THEN 'pending' ELSE 'completed' END,p.delivery_type,nm,mail,'wallet',array_to_string(contents,E'\n---\n'),jsonb_build_object('paid',true,'paid_at',now(),'awaiting_payment',false,'wallet_request_id',_request_id,'unit_cost',p.cost_price,'wallet_source',CASE WHEN tid IS NULL THEN 'website' ELSE 'bot' END)) RETURNING * INTO o;
IF tid IS NOT NULL THEN
 PERFORM public.bot_user_debit(tid,amount,'balance','website-wallet:'||o.id,p.name);
ELSE
 UPDATE public.profiles SET wallet_balance=round(wallet_balance-amount,2), updated_at=now() WHERE id=_user_id RETURNING wallet_balance INTO unit;
 INSERT INTO public.wallet_transactions(user_id,type,amount,balance_after,reference,note) VALUES(_user_id,'purchase',-amount,unit,'website-wallet:'||o.id,p.name);
END IF;
RETURN jsonb_build_object('id',o.id,'order_no',o.order_no,'email',mail,'changed',true);
END $$;
REVOKE ALL ON FUNCTION public.purchase_website_wallet(uuid,uuid,integer,uuid,numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_website_fulfillment(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.website_fulfillment_candidates(integer) FROM PUBLIC, anon, authenticated;