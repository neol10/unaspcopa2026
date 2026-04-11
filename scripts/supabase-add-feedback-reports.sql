begin;

create extension if not exists pgcrypto;

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role = 'admin'
  );
$$;

create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('problema', 'melhoria', 'outro')),
  message text not null check (char_length(trim(message)) between 5 and 1000),
  page_path text null,
  user_id uuid references auth.users(id) on delete set null,
  user_email text null,
  user_agent text null,
  status text not null default 'aberto' check (status in ('aberto', 'concluido')),
  concluded_at timestamptz null,
  concluded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_reports_created_at on public.feedback_reports(created_at desc);
create index if not exists idx_feedback_reports_status on public.feedback_reports(status);

alter table public.feedback_reports enable row level security;

drop policy if exists feedback_reports_insert on public.feedback_reports;
drop policy if exists feedback_reports_admin_select on public.feedback_reports;
drop policy if exists feedback_reports_admin_update on public.feedback_reports;

create policy feedback_reports_insert
on public.feedback_reports
for insert
to anon, authenticated
with check (
  category in ('problema', 'melhoria', 'outro')
  and char_length(trim(message)) between 5 and 1000
  and (
    (auth.role() = 'authenticated' and user_id = auth.uid())
    or (auth.role() = 'anon' and user_id is null)
  )
);

create policy feedback_reports_admin_select
on public.feedback_reports
for select
to authenticated
using (public.is_admin(auth.uid()));

create policy feedback_reports_admin_update
on public.feedback_reports
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

commit;
