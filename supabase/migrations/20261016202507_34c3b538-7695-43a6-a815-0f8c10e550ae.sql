ALTER FUNCTION public.read_public_products() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.read_public_products() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_public_products() TO service_role;
REVOKE ALL ON public.public_products FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.public_products TO service_role;
COMMENT ON VIEW public.public_products IS 'Server-only safe product projection, invoker-secured. Public storefront handlers return only these columns. No supplier identifiers or costs. Underlying products retain admin-only RLS.';