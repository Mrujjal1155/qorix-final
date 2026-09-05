-- Run this once in your Supabase SQL editor.

-- 1) Optional per-product content blocks shown on the product page
alter table public.products
  add column if not exists important_note text,
  add column if not exists quick_guide text;

-- 2) "Notify me when available" subscriptions
create table if not exists public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  telegram_id bigint not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (product_id, telegram_id)
);

create index if not exists idx_stock_alerts_product
  on public.stock_alerts (product_id) where notified_at is null;

grant select, insert, update, delete on public.stock_alerts to authenticated;
grant all on public.stock_alerts to service_role;

alter table public.stock_alerts enable row level security;

drop policy if exists "service role manages stock alerts" on public.stock_alerts;
create policy "service role manages stock alerts"
  on public.stock_alerts for all
  to service_role
  using (true) with check (true);
