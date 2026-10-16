CREATE VIEW public.public_products WITH (security_barrier = true) AS
SELECT p.id,p.category_id,p.name,p.emoji,p.description,p.price,p.old_price,p.delivery_type,p.is_active,p.sort_order,p.created_at,p.updated_at,p.image_url,p.delivery_time,p.badge,p.important_note,p.quick_guide,p.featured_rank,p.details,p.flash_ends_at,p.manual_stock_limited,
CASE WHEN p.supplier_id IS NOT NULL THEN GREATEST(p.supplier_stock,0) ELSE GREATEST(COALESCE(sc.available,0),0) END AS stock,
(p.delivery_type='auto' OR p.supplier_id IS NOT NULL) AS instant
FROM public.products p LEFT JOIN public.stock_counters sc ON sc.product_id=p.id
WHERE p.is_active=true AND p.owner_reseller_id IS NULL;
COMMENT ON VIEW public.public_products IS 'Deliberately owner-executed public read-only projection. security_barrier and explicit active/ownership predicates protect private rows; supplier identifiers, costs and credentials are excluded. Underlying tables retain RLS.';
REVOKE ALL ON public.public_products FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.public_products TO anon,authenticated,service_role;
DROP POLICY IF EXISTS products_public_read ON public.products;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;