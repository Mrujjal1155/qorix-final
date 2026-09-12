ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY['pending'::text,'completed'::text,'cancelled'::text,'awaiting_payment'::text,'failed'::text,'refunded'::text]));
CREATE INDEX IF NOT EXISTS orders_awaiting_idx ON public.orders (status, created_at) WHERE status = 'awaiting_payment';