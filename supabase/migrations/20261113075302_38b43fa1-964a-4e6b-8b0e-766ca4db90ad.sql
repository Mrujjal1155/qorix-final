CREATE TABLE public.payment_manual_reconciliations (deposit_id uuid PRIMARY KEY REFERENCES public.binance_deposits(id), gateway text NOT NULL, telegram_id bigint NOT NULL, amount numeric NOT NULL, txid text NOT NULL, transaction_keys text[] NOT NULL, admin_id uuid NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.payment_manual_reconciliations TO authenticated;
GRANT ALL ON public.payment_manual_reconciliations TO service_role;
ALTER TABLE public.payment_manual_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_manual_admin_read ON public.payment_manual_reconciliations FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TRIGGER payment_manual_touch BEFORE UPDATE ON public.payment_manual_reconciliations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE FUNCTION public.reconcile_manual_deposit(_deposit_id uuid,_expected_txid text,_keys text[],_reason text,_admin_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.binance_deposits%ROWTYPE; expected_key text; k text;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' OR NOT public.has_role(_admin_id,'admin') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
SELECT * INTO d FROM public.binance_deposits WHERE id=_deposit_id FOR UPDATE;
IF NOT FOUND OR d.kind NOT IN ('payid','bybit','chain_trc20','chain_bep20') OR d.telegram_id<=0 OR d.amount_usdt<=0 OR d.meta ? 'reseller_id' THEN RAISE EXCEPTION 'Unsupported deposit'; END IF;
IF EXISTS(SELECT 1 FROM public.payment_manual_reconciliations WHERE deposit_id=d.id) THEN RETURN jsonb_build_object('ok',true,'changed',false); END IF;
IF d.status='credited' OR d.tx_id IS NULL OR d.tx_id IS DISTINCT FROM _expected_txid THEN RAISE EXCEPTION 'Payment changed or already credited'; END IF;
IF length(trim(_reason))<5 OR length(_reason)>500 OR cardinality(_keys) NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Invalid reconciliation'; END IF;
IF d.kind LIKE 'chain_%' THEN
IF (d.kind='chain_bep20' AND lower(d.tx_id) !~ '^0x[0-9a-f]{64}$') OR (d.kind='chain_trc20' AND lower(d.tx_id) !~ '^[0-9a-f]{64}$') THEN RAISE EXCEPTION 'Invalid TXID'; END IF;
expected_key:='chain:'||replace(d.kind,'chain_','')||':'||lower(d.tx_id);
ELSIF d.kind='bybit' THEN
IF d.tx_id !~ '^[A-Za-z0-9_-]{6,128}$' THEN RAISE EXCEPTION 'Invalid TXID'; END IF; expected_key:='bybit:'||d.tx_id;
ELSE expected_key:=d.tx_id;
END IF;
IF NOT expected_key=ANY(_keys) THEN RAISE EXCEPTION 'Transaction key mismatch'; END IF;
FOREACH k IN ARRAY _keys LOOP
IF k IS NULL OR length(k)<6 OR length(k)>160 OR (d.kind<>'payid' AND k<>expected_key) OR (d.kind='payid' AND k !~ '^[A-Za-z0-9_-]{6,128}$') THEN RAISE EXCEPTION 'Invalid transaction key'; END IF;
END LOOP;
BEGIN
INSERT INTO public.binance_used_txs(tx_id) SELECT DISTINCT unnest(_keys);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('ok',false,'code','already_used'); END;
INSERT INTO public.payment_manual_reconciliations(deposit_id,gateway,telegram_id,amount,txid,transaction_keys,admin_id,reason) VALUES(d.id,d.kind,d.telegram_id,d.amount_usdt,d.tx_id,_keys,_admin_id,trim(_reason));
UPDATE public.binance_deposits SET status='credited',meta=coalesce(meta,'{}'::jsonb)||jsonb_build_object('manual_reconciled',true,'manual_reconciled_at',now(),'manual_reconciled_by',_admin_id,'manual_reconciled_reason',trim(_reason),'manual_no_credit',true) WHERE id=d.id;
RETURN jsonb_build_object('ok',true,'changed',true);
END $$;
REVOKE ALL ON FUNCTION public.reconcile_manual_deposit(uuid,text,text[],text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_manual_deposit(uuid,text,text[],text,uuid) TO service_role;