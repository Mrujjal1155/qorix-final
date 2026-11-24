ALTER TABLE public.products ALTER COLUMN price TYPE numeric(12,4), ALTER COLUMN old_price TYPE numeric(12,4);
ALTER TABLE public.orders ALTER COLUMN unit_price TYPE numeric(12,4);