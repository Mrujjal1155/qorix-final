CREATE OR REPLACE FUNCTION public.guard_owner_reseller_order()
RETURNS trigger LANGUAGE plpgsql SET search_path TO public AS $$
BEGIN
 IF OLD.reseller_id IS NULL OR OLD.meta->>'reseller_owner_rule' IS DISTINCT FROM 'true' THEN RETURN NEW; END IF;
 IF OLD.meta->>'refunded'='true' AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.delivered_content IS DISTINCT FROM OLD.delivered_content OR NEW.meta->>'refunded' IS DISTINCT FROM 'true' OR NEW.meta->>'refund_amount' IS DISTINCT FROM OLD.meta->>'refund_amount') THEN RAISE EXCEPTION 'Refunded order is terminal'; END IF;
 IF OLD.status IN ('cancelled','expired') AND NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Cancelled or expired order is terminal'; END IF;
 IF NEW.status IN ('cancelled','expired') THEN NEW.delivered_content:=NULL; NEW.meta:=coalesce(NEW.meta,'{}'::jsonb)||jsonb_build_object('refunded',false); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_owner_reseller_order BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_owner_reseller_order();
REVOKE ALL ON FUNCTION public.guard_owner_reseller_order() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_owner_reseller_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE o public.orders%ROWTYPE;
BEGIN
 IF NEW.type<>'refund' THEN RETURN NEW; END IF;
 SELECT * INTO o FROM public.orders WHERE reseller_id=NEW.reseller_id AND external_ref=NEW.reference AND meta->>'reseller_owner_rule'='true' FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF o.status<>'pending' OR o.meta->>'refunded'='true' OR EXISTS(SELECT 1 FROM public.reseller_transactions WHERE reseller_id=NEW.reseller_id AND reference=NEW.reference AND type='refund') THEN RAISE EXCEPTION 'Order cannot be refunded'; END IF;
 IF NEW.amount IS DISTINCT FROM (o.meta->>'debit_amount')::numeric THEN RAISE EXCEPTION 'Refund must match original debit'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_owner_reseller_refund BEFORE INSERT ON public.reseller_transactions FOR EACH ROW EXECUTE FUNCTION public.guard_owner_reseller_refund();
REVOKE ALL ON FUNCTION public.guard_owner_reseller_refund() FROM PUBLIC,anon,authenticated;