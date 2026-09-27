CREATE INDEX IF NOT EXISTS idx_stock_items_unsold_product ON public.stock_items (product_id) WHERE is_sold = false;

CREATE OR REPLACE FUNCTION public.apply_supplier_snapshot(_supplier_id uuid, _fetched_at timestamp with time zone, _rows jsonb, _product_updates jsonb, _status text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  last_sync timestamptz;
  rows_written integer := 0;
  products_written integer := 0;
BEGIN
  SELECT last_synced_at INTO last_sync FROM public.suppliers WHERE id = _supplier_id FOR UPDATE;
  IF last_sync IS NOT NULL AND _fetched_at IS NOT NULL AND last_sync > _fetched_at THEN
    RETURN jsonb_build_object('ok', false, 'stale', true);
  END IF;

  IF _rows IS NOT NULL AND jsonb_typeof(_rows) = 'array' THEN
    INSERT INTO public.supplier_products AS sp (
      supplier_id, external_id, name, description, cost_price, stock,
      currency, min_qty, raw, last_synced_at
    )
    SELECT _supplier_id, r.external_id, r.name, r.description,
      coalesce(r.cost_price, 0), coalesce(r.stock, 0),
      coalesce(r.currency, 'USD'), coalesce(r.min_qty, 1), r.raw,
      coalesce(_fetched_at, now())
    FROM jsonb_to_recordset(_rows) AS r(
      external_id text, name text, description text, cost_price numeric,
      stock integer, currency text, min_qty integer, raw jsonb
    )
    ON CONFLICT (supplier_id, external_id) DO UPDATE SET
      name = excluded.name, description = excluded.description,
      cost_price = excluded.cost_price, stock = excluded.stock,
      currency = excluded.currency, min_qty = excluded.min_qty,
      raw = excluded.raw, last_synced_at = excluded.last_synced_at
    WHERE (sp.last_synced_at IS NULL OR sp.last_synced_at <= excluded.last_synced_at)
      AND (sp.name, sp.description, sp.cost_price, sp.stock, sp.currency, sp.min_qty, sp.raw)
          IS DISTINCT FROM
          (excluded.name, excluded.description, excluded.cost_price, excluded.stock, excluded.currency, excluded.min_qty, excluded.raw);
    GET DIAGNOSTICS rows_written = ROW_COUNT;
  END IF;

  IF _product_updates IS NOT NULL AND jsonb_typeof(_product_updates) = 'array' THEN
    WITH u AS (
      SELECT * FROM jsonb_to_recordset(_product_updates) AS x(
        id uuid, name text, description text, has_description boolean, price numeric,
        supplier_stock integer, is_active boolean, image_url text, delivery_time text,
        important_note text, quick_guide text, details jsonb)
    ), n AS (
      SELECT p.id,
        coalesce(u.name, p.name) AS name,
        CASE WHEN coalesce(u.has_description, false) THEN u.description ELSE p.description END AS description,
        coalesce(u.price, p.price) AS price,
        coalesce(u.supplier_stock, p.supplier_stock) AS supplier_stock,
        coalesce(u.is_active, p.is_active) AS is_active,
        coalesce(u.image_url, p.image_url) AS image_url,
        coalesce(u.delivery_time, p.delivery_time) AS delivery_time,
        coalesce(u.important_note, p.important_note) AS important_note,
        coalesce(u.quick_guide, p.quick_guide) AS quick_guide,
        CASE WHEN u.details IS NOT NULL THEN u.details ELSE p.details END AS details
      FROM public.products p JOIN u ON u.id = p.id
    )
    UPDATE public.products p SET
      name = n.name, description = n.description, price = n.price,
      supplier_stock = n.supplier_stock, is_active = n.is_active,
      image_url = n.image_url, delivery_time = n.delivery_time,
      important_note = n.important_note, quick_guide = n.quick_guide,
      details = n.details, updated_at = now()
    FROM n
    WHERE p.id = n.id
      AND (p.name, p.description, p.price, p.supplier_stock, p.is_active, p.image_url,
           p.delivery_time, p.important_note, p.quick_guide, p.details)
          IS DISTINCT FROM
          (n.name, n.description, n.price, n.supplier_stock, n.is_active, n.image_url,
           n.delivery_time, n.important_note, n.quick_guide, n.details);
    GET DIAGNOSTICS products_written = ROW_COUNT;
  END IF;

  UPDATE public.suppliers
     SET last_synced_at = coalesce(_fetched_at, now()),
         last_status = coalesce(_status, last_status)
   WHERE id = _supplier_id;

  RETURN jsonb_build_object('ok', true, 'stale', false,
    'catalogue_rows', rows_written, 'products', products_written);
END;
$function$;