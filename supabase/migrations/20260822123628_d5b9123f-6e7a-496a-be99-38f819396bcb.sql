create table public.binance_deposits (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  kind text not null default 'payid',
  network text,
  address text,
  amount_usdt numeric not null default 0,
  status text not null default 'pending',
  tx_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours'
);
grant select, insert, update, delete on public.binance_deposits to authenticated;
grant all on public.binance_deposits to service_role;
alter table public.binance_deposits enable row level security;
create policy "admins manage binance_deposits" on public.binance_deposits for all to authenticated
  using (has_role(auth.uid(),'admin')) with check (has_role(auth.uid(),'admin'));
create trigger trg_binance_deposits_updated before update on public.binance_deposits
  for each row execute function public.set_updated_at();

create table public.binance_used_txs (
  tx_id text primary key,
  created_at timestamptz not null default now()
);
grant select on public.binance_used_txs to authenticated;
grant all on public.binance_used_txs to service_role;
alter table public.binance_used_txs enable row level security;
create policy "admins read binance_used_txs" on public.binance_used_txs for select to authenticated
  using (has_role(auth.uid(),'admin'));