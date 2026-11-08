-- Narrow protection: old orders and shared wallet writers remain unchanged.
CREATE OR REPLACE FUNCTION public.guard_owner_reseller_order()
RETURNS trigger LANGUAGE plpgsql SET search_path TO public AS $$
BEGIN
 IF OLD.reseller_id IS NULL OR OLD.meta->>'reseller_owner_rule' IS DISTINCT FROM 'true' THEN RETURN NEW; END IF;
 IF NEW.reseller_id IS DISTINCT FROM OLD.reseller_id OR NEW.external_ref IS DISTINCT FROM OLD.external_ref OR NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.total IS DISTINCT FROM OLD.total OR NEW.unit_price IS DISTINCT FROM OLD.unit_price OR NEW.payment_method IS DISTINCT FROM OLD.payment_method OR NEW.meta->>'reseller_owner_rule' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Order financial identity is immutable'; END IF;
 IF OLD.meta ? 'debit_amount' AND NEW.meta->>'debit_amount' IS DISTINCT FROM OLD.meta->>'debit_amount' THEN RAISE EXCEPTION 'Original debit is immutable'; END IF;
 IF OLD.meta->>'refunded'='true' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.delivered_content IS DISTINCT FROM OLD.delivered_content OR NEW.meta->>'refunded' IS DISTINCT FROM 'true' OR NEW.meta->>'refund_amount' IS DISTINCT FROM OLD.meta->>'refund_amount') THEN RAISE EXCEPTION 'Refunded order is terminal'; END IF;
 IF OLD.status IN ('completed','cancelled','expired','refunded','failed') AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.delivered_content IS DISTINCT FROM OLD.delivered_content) THEN RAISE EXCEPTION 'Terminal order delivery is immutable'; END IF;
 IF NEW.status IN ('cancelled','expired') THEN NEW.delivered_content:=NULL; NEW.meta:=coalesce(NEW.meta,'{}'::jsonb)||jsonb_build_object('refunded',false); END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_owner_reseller_order() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.save_reseller_delivery(_order_id uuid,_content text DEFAULT NULL,_supplier_error text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE o public.orders%ROWTYPE; ref text; net_paid numeric;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=_order_id FOR UPDATE;
 IF NOT FOUND OR o.reseller_id IS NULL OR o.meta->>'reseller_owner_rule' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 IF o.status<>'pending' OR o.meta->>'refunded'='true' THEN RETURN jsonb_build_object('status',o.status,'order',to_jsonb(o),'changed',false); END IF;
 ref:=coalesce(nullif(o.external_ref,''),o.id::text);
 SELECT -coalesce(sum(amount),0) INTO net_paid FROM public.reseller_transactions WHERE reseller_id=o.reseller_id AND reference=ref AND type IN ('order','refund');
 IF net_paid<>o.total OR o.meta->>'paid' IS DISTINCT FROM 'true' THEN RETURN jsonb_build_object('status','ineligible'); END IF;
 IF nullif(btrim(_content),'') IS NOT NULL THEN
  UPDATE public.orders SET status='completed',delivered_content=_content,meta=meta||jsonb_build_object('supplier_outcome','completed') WHERE id=o.id RETURNING * INTO o;
 ELSIF _supplier_error IS NOT NULL THEN
  UPDATE public.orders SET meta=meta||jsonb_build_object('supplier_outcome','unknown','supplier_failed',true,'supplier_error',left(_supplier_error,500)) WHERE id=o.id RETURNING * INTO o;
 END IF;
 RETURN jsonb_build_object('status',o.status,'order',to_jsonb(o),'changed',true);
END $$;
REVOKE ALL ON FUNCTION public.save_reseller_delivery(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_reseller_delivery(uuid,text,text) TO service_role;