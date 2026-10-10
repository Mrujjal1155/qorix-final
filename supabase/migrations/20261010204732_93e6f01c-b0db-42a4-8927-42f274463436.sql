ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preorder_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preorder_percent numeric NOT NULL DEFAULT 5;
CREATE INDEX IF NOT EXISTS orders_preorder_queue_idx ON public.orders (product_id, created_at) WHERE status = 'preorder';