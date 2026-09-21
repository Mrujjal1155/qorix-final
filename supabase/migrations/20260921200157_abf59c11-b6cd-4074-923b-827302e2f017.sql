CREATE TABLE public.supplier_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT 'new',
  name text NOT NULL DEFAULT '',
  cost_price numeric NOT NULL DEFAULT 0,
  price numeric NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX supplier_review_queue_uniq ON public.supplier_review_queue (supplier_id, external_id);
CREATE INDEX supplier_review_queue_status_idx ON public.supplier_review_queue (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_review_queue TO authenticated;
GRANT ALL ON public.supplier_review_queue TO service_role;
ALTER TABLE public.supplier_review_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage supplier review queue"
  ON public.supplier_review_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_supplier_review_queue_updated
  BEFORE UPDATE ON public.supplier_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.visibility_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  product_name text NOT NULL DEFAULT '',
  surface text NOT NULL DEFAULT 'bot',
  detail text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX visibility_alerts_recent_idx ON public.visibility_alerts (resolved, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visibility_alerts TO authenticated;
GRANT ALL ON public.visibility_alerts TO service_role;
ALTER TABLE public.visibility_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage visibility alerts"
  ON public.visibility_alerts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));