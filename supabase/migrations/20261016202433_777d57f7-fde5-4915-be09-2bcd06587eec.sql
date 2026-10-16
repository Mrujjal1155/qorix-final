CREATE FUNCTION public.read_public_products() RETURNS TABLE (
id uuid,category_id uuid,name text,emoji text,description text,price numeric,old_price numeric,delivery_type text,is_active boolean,sort_order integer,created_at timestamptz,updated_at timestamptz,image_url text,delivery_time text,badge text,important_note text,quick_guide text,featured_rank integer,details jsonb,flash_ends_at timestamptz,manual_stock_limited boolean,stock integer,instant boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT p.id,p.category_id,p.name,p.emoji,p.description,p.price,p.old_price,p.delivery_type,p.is_active,p.sort_order,p.created_at,p.updated_at,p.image_url,p.delivery_time,p.badge,p.important_note,p.quick_guide,p.featured_rank,p.details,p.flash_ends_at,p.manual_stock_limited,
CASE WHEN p.supplier_id IS NOT NULL THEN GREATEST(p.supplier_stock,0) ELSE GREATEST(COALESCE(sc.available,0),0) END,
(p.delivery_type='auto' OR p.supplier_id IS NOT NULL)
FROM public.products p LEFT JOIN public.stock_counters sc ON sc.product_id=p.id WHERE p.is_active=true AND p.owner_reseller_id IS NULL;
$$;
REVOKE ALL ON FUNCTION public.read_public_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_public_products() TO anon,authenticated,service_role;
DROP VIEW public.public_products;
CREATE VIEW public.public_products WITH (security_invoker=true,security_barrier=true) AS SELECT * FROM public.read_public_products();
REVOKE ALL ON public.public_products FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.public_products TO anon,authenticated,service_role;
COMMENT ON VIEW public.public_products IS 'Invoker-secured read-only view over a fixed, parameter-free public projection. The function returns only active, unowned products and never returns supplier identifiers, costs or credentials.';