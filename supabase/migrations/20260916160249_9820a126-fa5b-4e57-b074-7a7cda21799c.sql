CREATE TABLE IF NOT EXISTS public.supplier_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer NOT NULL DEFAULT 0,
  ok boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'auto',
  checked integer NOT NULL DEFAULT 0,
  changed integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_sync_runs_supplier
  ON public.supplier_sync_runs (supplier_id, created_at DESC);

GRANT SELECT ON public.supplier_sync_runs TO authenticated;
GRANT ALL ON public.supplier_sync_runs TO service_role;

ALTER TABLE public.supplier_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read supplier sync runs" ON public.supplier_sync_runs;
CREATE POLICY "admins read supplier sync runs"
  ON public.supplier_sync_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "service role manages supplier sync runs" ON public.supplier_sync_runs;
CREATE POLICY "service role manages supplier sync runs"
  ON public.supplier_sync_runs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.apply_supplier_snapshot(
  _supplier_id uuid,
  _fetched_at timestamptz,
  _rows jsonb,
  _product_updates jsonb,
  _status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_sync timestamptz;
  rows_written integer := 0;
  products_written integer := 0;
BEGIN
  SELECT last_synced_at INTO last_sync FROM public.suppliers WHERE id = _supplier_id FOR UPDATE;

  -- A newer sync already landed: this response is stale, discard it entirely.
  IF last_sync IS NOT NULL AND _fetched_at IS NOT NULL AND last_sync > _fetched_at THEN
    RETURN jsonb_build_object('ok', false, 'stale', true);
  END IF;

  IF _rows IS NOT NULL AND jsonb_typeof(_rows) = 'array' THEN
    INSERT INTO public.supplier_products AS sp (
      supplier_id, external_id, name, description, cost_price, stock,
      currency, min_qty, raw, last_synced_at
    )
    SELECT
      _supplier_id, r.external_id, r.name, r.description,
      coalesce(r.cost_price, 0), coalesce(r.stock, 0),
      coalesce(r.currency, 'USD'), coalesce(r.min_qty, 1), r.raw,
      coalesce(_fetched_at, now())
    FROM jsonb_to_recordset(_rows) AS r(
      external_id text, name text, description text, cost_price numeric,
      stock integer, currency text, min_qty integer, raw jsonb
    )
    ON CONFLICT (supplier_id, external_id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      cost_price = excluded.cost_price,
      stock = excluded.stock,
      currency = excluded.currency,
      min_qty = excluded.min_qty,
      raw = excluded.raw,
      last_synced_at = excluded.last_synced_at
    WHERE sp.last_synced_at IS NULL OR sp.last_synced_at <= excluded.last_synced_at;
    GET DIAGNOSTICS rows_written = ROW_COUNT;
  END IF;

  IF _product_updates IS NOT NULL AND jsonb_typeof(_product_updates) = 'array' THEN
    UPDATE public.products p SET
      name = coalesce(u.name, p.name),
      description = CASE WHEN coalesce(u.has_description, false) THEN u.description ELSE p.description END,
      price = coalesce(u.price, p.price),
      supplier_stock = coalesce(u.supplier_stock, p.supplier_stock),
      is_active = coalesce(u.is_active, p.is_active),
      image_url = coalesce(u.image_url, p.image_url),
      delivery_time = coalesce(u.delivery_time, p.delivery_time),
      important_note = coalesce(u.important_note, p.important_note),
      quick_guide = coalesce(u.quick_guide, p.quick_guide),
      details = CASE WHEN u.details IS NOT NULL THEN u.details ELSE p.details END,
      updated_at = now()
    FROM jsonb_to_recordset(_product_updates) AS u(
      id uuid, name text, description text, has_description boolean, price numeric,
      supplier_stock integer, is_active boolean, image_url text, delivery_time text,
      important_note text, quick_guide text, details jsonb
    )
    WHERE p.id = u.id;
    GET DIAGNOSTICS products_written = ROW_COUNT;
  END IF;

  UPDATE public.suppliers
     SET last_synced_at = coalesce(_fetched_at, now()),
         last_status = coalesce(_status, last_status)
   WHERE id = _supplier_id;

  RETURN jsonb_build_object(
    'ok', true,
    'stale', false,
    'catalogue_rows', rows_written,
    'products', products_written
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_supplier_snapshot(uuid, timestamptz, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_supplier_snapshot(uuid, timestamptz, jsonb, jsonb, text) TO service_role;