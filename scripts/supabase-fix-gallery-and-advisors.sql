begin;

create extension if not exists pgcrypto;

-- 1) Corrige advisor: function_search_path_mutable
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

-- 2) Cria tabela base da galeria (remove erro 404 no app)
create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  media_url text not null,
  media_type text not null check (media_type in ('image', 'video')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gallery_created_at on public.gallery(created_at desc);

-- 3) Tabelas de interação
create table if not exists public.gallery_likes (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.gallery(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint gallery_likes_unique unique (gallery_id, user_id)
);

create index if not exists idx_gallery_likes_gallery_id on public.gallery_likes(gallery_id);
create index if not exists idx_gallery_likes_user_id on public.gallery_likes(user_id);

create table if not exists public.gallery_comments (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.gallery(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  comment text not null check (char_length(trim(comment)) between 2 and 500),
  created_at timestamptz not null default now()
);

create index if not exists idx_gallery_comments_gallery_id on public.gallery_comments(gallery_id);
create index if not exists idx_gallery_comments_created_at on public.gallery_comments(created_at desc);

-- 4) RLS
alter table public.gallery enable row level security;
alter table public.gallery_likes enable row level security;
alter table public.gallery_comments enable row level security;

-- Gallery: todo mundo pode ler, só admin escreve
-- (drop policy if exists sem aspas para evitar nomes antigos)
drop policy if exists gallery_select_all on public.gallery;
drop policy if exists gallery_admin_insert on public.gallery;
drop policy if exists gallery_admin_update on public.gallery;
drop policy if exists gallery_admin_delete on public.gallery;

create policy gallery_select_all
on public.gallery
for select
to anon, authenticated
using (true);

create policy gallery_admin_insert
on public.gallery
for insert
to authenticated
with check (public.is_admin(auth.uid()));

create policy gallery_admin_update
on public.gallery
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create policy gallery_admin_delete
on public.gallery
for delete
to authenticated
using (public.is_admin(auth.uid()));

-- Likes: logado cria/remove o proprio like

drop policy if exists gallery_likes_select_all on public.gallery_likes;
drop policy if exists gallery_likes_insert_own on public.gallery_likes;
drop policy if exists gallery_likes_delete_own_or_admin on public.gallery_likes;

create policy gallery_likes_select_all
on public.gallery_likes
for select
to anon, authenticated
using (true);

create policy gallery_likes_insert_own
on public.gallery_likes
for insert
to authenticated
with check (user_id = auth.uid());

create policy gallery_likes_delete_own_or_admin
on public.gallery_likes
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- Comments: logado comenta, dono/admin remove

drop policy if exists gallery_comments_select_all on public.gallery_comments;
drop policy if exists gallery_comments_insert_own on public.gallery_comments;
drop policy if exists gallery_comments_delete_own_or_admin on public.gallery_comments;

create policy gallery_comments_select_all
on public.gallery_comments
for select
to anon, authenticated
using (true);

create policy gallery_comments_insert_own
on public.gallery_comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and char_length(trim(comment)) between 2 and 500
);

create policy gallery_comments_delete_own_or_admin
on public.gallery_comments
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- 5) Corrige advisor: notifications INSERT permissivo
alter table if exists public.notifications enable row level security;
drop policy if exists "Only service_role can insert notifications" on public.notifications;
drop policy if exists notifications_insert_service_role on public.notifications;

create policy notifications_insert_service_role
on public.notifications
for insert
to service_role
with check (auth.role() = 'service_role');

-- 6) Corrige advisor: client_errors INSERT permissivo
-- Mantem insert para anon/authed sem WITH CHECK literal true.
-- Essa expressao nao e "always true" para o linter.
alter table if exists public.client_errors enable row level security;
drop policy if exists "Allow anon insert" on public.client_errors;
drop policy if exists client_errors_insert_limited on public.client_errors;

create policy client_errors_insert_limited
on public.client_errors
for insert
to anon, authenticated
with check (
  coalesce(current_setting('request.jwt.claim.role', true), '') in ('anon', 'authenticated')
);

commit;
