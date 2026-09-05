-- Run this once in your Supabase SQL editor.
-- Reseller supplier APIs (Qamify first) + markup driven auto-listing.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  base_url text not null,
  api_key text,
  is_enabled boolean not null default true,
  markup_percent numeric not null default 20,
  markup_fixed numeric not null default 0,
  last_synced_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  external_id text not null,
  name text not null,
  description text,
  cost_price numeric not null default 0,
  stock integer not null default 0,
  currency text not null default 'USD',
  min_qty integer not null default 1,
  raw jsonb,
  is_listed boolean not null default false,
  markup_percent numeric,
  markup_fixed numeric,
  price_override numeric,
  product_id uuid references public.products(id) on delete set null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (supplier_id, external_id)
);

create index if not exists idx_supplier_products_supplier
  on public.supplier_products (supplier_id);

alter table public.products
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists supplier_external_id text,
  add column if not exists supplier_stock integer not null default 0;

grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;
grant select, insert, update, delete on public.supplier_products to authenticated;
grant all on public.supplier_products to service_role;

alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;

drop policy if exists "admins manage suppliers" on public.suppliers;
create policy "admins manage suppliers"
  on public.suppliers for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "service role manages suppliers" on public.suppliers;
create policy "service role manages suppliers"
  on public.suppliers for all
  to service_role
  using (true) with check (true);

drop policy if exists "admins manage supplier products" on public.supplier_products;
create policy "admins manage supplier products"
  on public.supplier_products for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "service role manages supplier products" on public.supplier_products;
create policy "service role manages supplier products"
  on public.supplier_products for all
  to service_role
  using (true) with check (true);

-- Keep the supplier secret out of the browser and database.
-- It is read from the QAMIFY_API_KEY project secret at runtime.

-- Seed suppliers (API keys come from project secrets at runtime).
insert into public.suppliers (key, name, base_url, markup_percent, markup_fixed)
values
  ('qamify', 'Supplier A', 'https://api.qamify.site', 20, 0),
  ('vexoran', 'Vexoran Shoppie', 'https://eismrrkygprctnwxmkbw.supabase.co/functions/v1/reseller-api', 20, 0)
on conflict (key) do update set
  name = excluded.name,
  base_url = excluded.base_url;

-- Supplier C (Canboso) — API key comes from the CANBOSO_API_KEY secret.
insert into public.suppliers (key, name, base_url, markup_percent, markup_fixed)
values ('canboso', 'Canboso', 'https://canboso.com/api', 20, 0)
on conflict (key) do update set name = excluded.name, base_url = excluded.base_url;
