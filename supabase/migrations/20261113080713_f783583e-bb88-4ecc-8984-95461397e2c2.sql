CREATE TABLE public.historical_payment_txid_blocks(transaction_key text PRIMARY KEY,gateway text NOT NULL,cutoff_at timestamptz NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.historical_payment_txid_blocks TO authenticated;
GRANT ALL ON public.historical_payment_txid_blocks TO service_role;
ALTER TABLE public.historical_payment_txid_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY historical_payment_blocks_admin_read ON public.historical_payment_txid_blocks FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TRIGGER historical_payment_blocks_touch BEFORE UPDATE ON public.historical_payment_txid_blocks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX historical_payment_blocks_lower_key ON public.historical_payment_txid_blocks(lower(transaction_key)) WHERE gateway='payid';
CREATE FUNCTION public.guard_historical_payment_txid() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF EXISTS(SELECT 1 FROM public.historical_payment_txid_blocks b WHERE (b.gateway='payid' AND lower(b.transaction_key)=lower(NEW.tx_id)) OR (b.gateway<>'payid' AND b.transaction_key=NEW.tx_id)) THEN RAISE EXCEPTION 'Historical payment transaction already used' USING ERRCODE='23505'; END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.guard_historical_payment_txid() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_historical_payment_txid BEFORE INSERT ON public.binance_used_txs FOR EACH ROW EXECUTE FUNCTION public.guard_historical_payment_txid();