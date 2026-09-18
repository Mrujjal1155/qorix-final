create or replace function public.stock_counts(_product_ids uuid[] default null)
returns table(product_id uuid, available integer)
language sql
stable
security definer
set search_path = public
as $$
  select s.product_id, count(*)::int
  from public.stock_items s
  where s.is_sold = false
    and (_product_ids is null or s.product_id = any(_product_ids))
  group by s.product_id
$$;

grant execute on function public.stock_counts(uuid[]) to anon, authenticated, service_role;