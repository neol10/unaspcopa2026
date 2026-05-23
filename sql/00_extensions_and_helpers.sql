begin;

create extension if not exists pgcrypto;

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = coalesce(uid, auth.uid())
      and p.role = 'admin'
  );
$$;

commit;
