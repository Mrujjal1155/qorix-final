CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_updated ON public.support_tickets (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_binance_deposits_created ON public.binance_deposits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.transactions (created_at DESC);