CREATE INDEX IF NOT EXISTS idx_orders_telegram_status ON public.orders (telegram_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_binance_deposits_tx_id ON public.binance_deposits (tx_id) WHERE tx_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_binance_deposits_status_kind ON public.binance_deposits (status, kind, expires_at);
CREATE INDEX IF NOT EXISTS idx_binance_deposits_telegram ON public.binance_deposits (telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_active_sort ON public.products (is_active, sort_order);