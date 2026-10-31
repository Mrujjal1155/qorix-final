UPDATE public.products SET category_id = 'f48d9cf9-658f-49de-ac60-9fcdddec015b', updated_at = now() WHERE category_id = '5d7e206d-14c4-426d-962e-0c38d9431756';
INSERT INTO public.product_categories (product_id, category_id) SELECT product_id, 'f48d9cf9-658f-49de-ac60-9fcdddec015b' FROM public.product_categories WHERE category_id = '5d7e206d-14c4-426d-962e-0c38d9431756' ON CONFLICT DO NOTHING;
DELETE FROM public.product_categories WHERE category_id = '5d7e206d-14c4-426d-962e-0c38d9431756';
DELETE FROM public.categories WHERE id = '5d7e206d-14c4-426d-962e-0c38d9431756';