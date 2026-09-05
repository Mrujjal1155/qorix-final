
-- 1) Atomic bot wallet debit (prevents double-spend races on checkout)
create or replace function public.bot_user_debit(
  _telegram_id bigint,
  _amount numeric,
  _method text default 'balance',
  _reference text default 'wallet',
  _note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance numeric;
  new_spent numeric;
begin
  if _amount is null or _amount < 0 then
    raise exception 'Invalid amount';
  end if;

  update public.bot_users
     set balance = balance - _amount,
         total_spent = coalesce(total_spent, 0) + _amount
   where telegram_id = _telegram_id
     and balance >= _amount
  returning balance, total_spent into new_balance, new_spent;

  if new_balance is null then
    raise exception 'Insufficient balance';
  end if;

  insert into public.transactions (telegram_id, type, amount, method, reference, note)
  values (_telegram_id, 'purchase', -_amount, _method, _reference, _note);

  return jsonb_build_object('balance', new_balance, 'total_spent', new_spent);
end;
$$;

revoke all on function public.bot_user_debit(bigint, numeric, text, text, text) from public, anon, authenticated;
grant execute on function public.bot_user_debit(bigint, numeric, text, text, text) to service_role;

-- 2) Atomic stock claim (no two orders can receive the same stock item)
create or replace function public.claim_stock_items(
  _product_id uuid,
  _qty integer,
  _sold_to bigint default null
) returns setof public.stock_items
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id from public.stock_items
     where product_id = _product_id and is_sold = false
     order by created_at asc
     limit greatest(0, _qty)
     for update skip locked
  )
  update public.stock_items s
     set is_sold = true,
         sold_at = now(),
         sold_to = coalesce(_sold_to, s.sold_to)
    from picked
   where s.id = picked.id
  returning s.*;
end;
$$;

revoke all on function public.claim_stock_items(uuid, integer, bigint) from public, anon, authenticated;
grant execute on function public.claim_stock_items(uuid, integer, bigint) to service_role;

-- 3) Atomic redeem-code claim (single use, even on concurrent taps)
create or replace function public.redeem_code_claim(_code text, _telegram_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  amt numeric;
  new_balance numeric;
begin
  update public.redeem_codes
     set used_by = _telegram_id, used_at = now(), is_active = false
   where upper(code) = upper(_code)
     and is_active = true
     and used_by is null
  returning amount into amt;

  if amt is null then
    return jsonb_build_object('ok', false);
  end if;

  update public.bot_users
     set balance = balance + amt
   where telegram_id = _telegram_id
  returning balance into new_balance;

  insert into public.transactions (telegram_id, type, amount, method, reference, note)
  values (_telegram_id, 'deposit', amt, 'redeem_code', upper(_code), 'Redeem code');

  return jsonb_build_object('ok', true, 'amount', amt, 'balance', new_balance);
end;
$$;

revoke all on function public.redeem_code_claim(text, bigint) from public, anon, authenticated;
grant execute on function public.redeem_code_claim(text, bigint) to service_role;

-- 4) Hard duplicate protection on orders
create unique index if not exists orders_reseller_external_ref_uidx
  on public.orders (reseller_id, external_ref)
  where reseller_id is not null and external_ref is not null;

create unique index if not exists orders_txid_uidx
  on public.orders (txid)
  where txid is not null;
