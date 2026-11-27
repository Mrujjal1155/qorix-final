GRANT EXECUTE ON FUNCTION public.purchase_website_wallet(uuid,uuid,integer,uuid,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_website_fulfillment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.website_fulfillment_candidates(integer) TO service_role;