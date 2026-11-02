create or replace function public.admin_find_order_ids(_code text)
returns setof uuid
language sql stable security invoker set search_path = public
as $$
  select o.id from public.orders o
  where length(_code) between 4 and 32
    and replace(o.id::text, '-', '') ilike '%' || lower(regexp_replace(_code, '[^0-9a-fA-F]', '', 'g'))
  order by o.created_at desc limit 20
$$;
revoke all on function public.admin_find_order_ids(text) from public, anon;
grant execute on function public.admin_find_order_ids(text) to authenticated;