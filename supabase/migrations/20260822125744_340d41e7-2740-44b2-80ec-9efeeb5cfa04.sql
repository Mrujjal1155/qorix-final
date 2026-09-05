CREATE TABLE public.binance_credentials (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  api_key text NOT NULL DEFAULT '',
  api_secret text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT, UPDATE ON public.binance_credentials TO authenticated;
GRANT ALL ON public.binance_credentials TO service_role;

ALTER TABLE public.binance_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can insert binance creds" ON public.binance_credentials
FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins can update binance creds" ON public.binance_credentials
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_binance_creds_updated BEFORE UPDATE ON public.binance_credentials
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();