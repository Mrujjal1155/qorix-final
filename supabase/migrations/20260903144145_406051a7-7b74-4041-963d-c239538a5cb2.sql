CREATE TABLE public.resellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  api_key text NOT NULL UNIQUE,
  balance numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  allow_website boolean NOT NULL DEFAULT true,
  allow_bot boolean NOT NULL DEFAULT true,
  notes text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resellers TO authenticated;
GRANT ALL ON public.resellers TO service_role;
ALTER TABLE public.resellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage resellers" ON public.resellers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role manages resellers" ON public.resellers FOR ALL TO service_role
  USING (true) WITH CHECK (true);
CREATE TRIGGER trg_resellers_updated BEFORE UPDATE ON public.resellers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reseller_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id uuid NOT NULL REFERENCES public.resellers(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'credit',
  amount numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reseller_tx_reseller ON public.reseller_transactions (reseller_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reseller_transactions TO authenticated;
GRANT ALL ON public.reseller_transactions TO service_role;
ALTER TABLE public.reseller_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage reseller tx" ON public.reseller_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "service role manages reseller tx" ON public.reseller_transactions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reseller_id uuid REFERENCES public.resellers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS external_ref text;

CREATE INDEX IF NOT EXISTS idx_orders_reseller ON public.orders (reseller_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS orders_reseller_external_ref
  ON public.orders (reseller_id, external_ref)
  WHERE reseller_id IS NOT NULL AND external_ref IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reseller_adjust_balance(_reseller_id uuid, _amount numeric, _type text, _reference text, _note text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance numeric;
BEGIN
  UPDATE public.resellers
     SET balance = balance + _amount
   WHERE id = _reseller_id
  RETURNING balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Reseller not found';
  END IF;
  IF new_balance < 0 THEN
    RAISE EXCEPTION 'Insufficient reseller balance';
  END IF;

  INSERT INTO public.reseller_transactions (reseller_id, type, amount, balance_after, reference, note)
  VALUES (_reseller_id, COALESCE(_type, 'credit'), _amount, new_balance, _reference, _note);

  RETURN new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.reseller_adjust_balance(uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reseller_adjust_balance(uuid, numeric, text, text, text) TO service_role;