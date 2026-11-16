INSERT INTO public.suppliers (key, name, base_url, is_enabled, last_status)
VALUES ('insightstore', 'Insight Store', 'https://api.insightxpro.store', false, 'Not connected — add API key and test before enabling')
ON CONFLICT (key) DO NOTHING;