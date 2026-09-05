alter table public.categories add column if not exists channel text not null default 'both';
alter table public.orders add column if not exists source text not null default 'telegram';
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists txid text;
alter table public.orders add column if not exists payment_method text;
alter table public.orders alter column telegram_id set default 0;

grant select on public.categories to anon;
grant select on public.products to anon;

drop policy if exists "public read active categories" on public.categories;
create policy "public read active categories" on public.categories for select to anon using (is_active = true);

drop policy if exists "public read active products" on public.products;
create policy "public read active products" on public.products for select to anon using (is_active = true);

create index if not exists idx_orders_source on public.orders (source);