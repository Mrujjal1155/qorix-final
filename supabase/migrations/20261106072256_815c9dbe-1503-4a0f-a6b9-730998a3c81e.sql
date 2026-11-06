create or replace function public.handle_new_user_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles(user_id, role) values (new.id, 'user') on conflict do nothing;
  return new;
end; $$;
revoke all on function public.handle_new_user_role() from public, anon, authenticated;