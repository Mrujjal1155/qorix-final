
-- ROLES
create type public.app_role as enum ('admin','moderator','user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());
create policy "admins manage roles" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- BOT USERS
create table public.bot_users (
  telegram_id bigint primary key,
  username text,
  first_name text,
  last_name text,
  balance numeric(12,2) not null default 0,
  total_spent numeric(12,2) not null default 0,
  membership text not null default 'Bronze',
  ref_code text unique,
  referred_by bigint,
  referral_earnings numeric(12,2) not null default 0,
  referral_count integer not null default 0,
  is_banned boolean not null default false,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.bot_users to authenticated;
grant all on public.bot_users to service_role;
alter table public.bot_users enable row level security;
create policy "admins manage bot_users" on public.bot_users for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger trg_bot_users_updated before update on public.bot_users for each row execute function public.set_updated_at();

-- CATEGORIES
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  emoji text default '📁',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "admins manage categories" on public.categories for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- PRODUCTS
create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  emoji text default '📦',
  description text,
  price numeric(12,2) not null default 0,
  old_price numeric(12,2),
  delivery_type text not null default 'auto' check (delivery_type in ('auto','manual')),
  manual_note text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "admins manage products" on public.products for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger trg_products_updated before update on public.products for each row execute function public.set_updated_at();

-- STOCK
create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  content text not null,
  is_sold boolean not null default false,
  sold_to bigint,
  sold_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_stock_product on public.stock_items(product_id, is_sold);
grant select, insert, update, delete on public.stock_items to authenticated;
grant all on public.stock_items to service_role;
alter table public.stock_items enable row level security;
create policy "admins manage stock" on public.stock_items for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- ORDERS
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no bigserial,
  telegram_id bigint not null,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null default 1,
  unit_price numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  delivery_type text not null default 'auto',
  delivered_content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.orders to authenticated;
grant all on public.orders to service_role;
grant usage, select on sequence public.orders_order_no_seq to service_role;
alter table public.orders enable row level security;
create policy "admins manage orders" on public.orders for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger trg_orders_updated before update on public.orders for each row execute function public.set_updated_at();

-- TRANSACTIONS
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  type text not null check (type in ('deposit','purchase','refund','referral','admin')),
  amount numeric(12,2) not null default 0,
  method text,
  status text not null default 'completed',
  reference text,
  note text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.transactions to authenticated;
grant all on public.transactions to service_role;
alter table public.transactions enable row level security;
create policy "admins manage transactions" on public.transactions for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- PAYMENT REQUESTS
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  method text not null,
  amount numeric(12,2) not null default 0,
  txid text,
  sender_info text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.payment_requests to authenticated;
grant all on public.payment_requests to service_role;
alter table public.payment_requests enable row level security;
create policy "admins manage payment_requests" on public.payment_requests for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger trg_payreq_updated before update on public.payment_requests for each row execute function public.set_updated_at();

-- REDEEM CODES
create table public.redeem_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  amount numeric(12,2) not null default 0,
  used_by bigint,
  used_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.redeem_codes to authenticated;
grant all on public.redeem_codes to service_role;
alter table public.redeem_codes enable row level security;
create policy "admins manage redeem_codes" on public.redeem_codes for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- SETTINGS
create table public.bot_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.bot_settings to authenticated;
grant all on public.bot_settings to service_role;
alter table public.bot_settings enable row level security;
create policy "admins manage bot_settings" on public.bot_settings for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create trigger trg_settings_updated before update on public.bot_settings for each row execute function public.set_updated_at();

insert into public.bot_settings(key,value) values
  ('bot_name','Qamify'),
  ('welcome_text','Quality products at cheapest rates'),
  ('binance_pay_id',''),
  ('usdt_bep20_address',''),
  ('bkash_number',''),
  ('nagad_number',''),
  ('announce_chat_id',''),
  ('admin_telegram_ids',''),
  ('support_link',''),
  ('freebies_text','No freebies right now. Check back later!'),
  ('support_text','Contact our support team.'),
  ('emails_trials_text','Emails & Trials coming soon.'),
  ('reseller_api_text','Reseller API coming soon.'),
  ('referral_percent','1');

-- first signed-up user becomes admin
create or replace function public.handle_new_user_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles(user_id, role) values (new.id, 'user') on conflict do nothing;
  end if;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user_role();
