CREATE UNIQUE INDEX IF NOT EXISTS orders_website_wallet_request_uidx ON public.orders(user_id,(meta->>'wallet_request_id')) WHERE payment_method='wallet';
CREATE OR REPLACE FUNCTION public.purchase_website_wallet(_user_id uuid,_product_id uuid,_qty integer,_request_id uuid,_expected_total numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.products%ROWTYPE; u public.bot_users%ROWTYPE; o public.orders%ROWTYPE; tid bigint; mail text; contents text[]; n integer; amount numeric;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden'; END IF;
IF _user_id IS NULL OR _qty IS NULL OR _qty<1 OR _qty>100000 OR _request_id IS NULL THEN RAISE EXCEPTION 'Invalid request'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text||_request_id::text,0));
SELECT * INTO o FROM public.orders WHERE user_id=_user_id AND payment_method='wallet' AND meta->>'wallet_request_id'=_request_id::text;
IF FOUND THEN
IF o.product_id IS DISTINCT FROM _product_id OR o.quantity<>_qty THEN RAISE EXCEPTION 'Request already used'; END IF;
RETURN jsonb_build_object('id',o.id,'order_no',o.order_no,'email',o.customer_email,'changed',false);
END IF;
SELECT telegram_id,email INTO tid,mail FROM public.profiles WHERE id=_user_id FOR SHARE;
IF tid IS NULL OR tid=0 THEN RAISE EXCEPTION 'Connect your Telegram account first'; END IF;
SELECT * INTO u FROM public.bot_users WHERE telegram_id=tid FOR UPDATE;
IF NOT FOUND OR coalesce(u.is_banned,false) THEN RAISE EXCEPTION 'Wallet unavailable'; END IF;
SELECT * INTO p FROM public.products WHERE id=_product_id FOR SHARE;
IF NOT FOUND OR NOT p.is_active THEN RAISE EXCEPTION 'Product unavailable'; END IF;
amount:=round(p.price*_qty,2);
IF amount<=0 OR amount IS DISTINCT FROM _expected_total THEN RAISE EXCEPTION 'Price changed. Refresh checkout'; END IF;
IF u.balance<amount THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
IF p.supplier_id IS NOT NULL AND p.delivery_type<>'manual' THEN
IF coalesce(p.supplier_stock,0)<_qty OR NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p.supplier_id AND is_enabled) THEN RAISE EXCEPTION 'Stock unavailable'; END IF;
ELSIF p.delivery_type='auto' THEN
SELECT array_agg(s.content),count(*)::integer INTO contents,n FROM public.claim_stock_items(p.id,_qty,tid) s;
IF n<>_qty OR EXISTS(SELECT 1 FROM unnest(contents) c WHERE nullif(btrim(c),'') IS NULL) THEN RAISE EXCEPTION 'Stock unavailable'; END IF;
ELSIF p.manual_stock_limited THEN
IF public.take_manual_stock(p.id,_qty) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Stock unavailable'; END IF;
END IF;
mail:=coalesce(nullif(mail,''),'tg'||tid||'@telegram.qorix.local');
INSERT INTO public.orders(telegram_id,user_id,source,product_id,product_name,quantity,unit_price,total,status,delivery_type,customer_name,customer_email,payment_method,delivered_content,meta)
VALUES(tid,_user_id,'website',p.id,p.name,_qty,p.price,amount,CASE WHEN contents IS NULL THEN 'pending' ELSE 'completed' END,p.delivery_type,coalesce(nullif(u.first_name,''),'Telegram user'),mail,'wallet',array_to_string(contents,E'\n---\n'),jsonb_build_object('paid',true,'paid_at',now(),'awaiting_payment',false,'wallet_request_id',_request_id,'unit_cost',p.cost_price)) RETURNING * INTO o;
PERFORM public.bot_user_debit(tid,amount,'balance','website-wallet:'||o.id,p.name);
RETURN jsonb_build_object('id',o.id,'order_no',o.order_no,'email',mail,'changed',true);
END $$;
REVOKE ALL ON FUNCTION public.purchase_website_wallet(uuid,uuid,integer,uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_website_wallet(uuid,uuid,integer,uuid,numeric) TO service_role;