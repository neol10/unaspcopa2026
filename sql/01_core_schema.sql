begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  badge_url text not null default '',
  "group" text not null default '',
  leader text not null default '',
  primary_color text not null default '',
  division text not null default 'masculino',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete set null,
  division text not null default 'masculino',
  name text not null,
  number integer not null default 0,
  position text not null default '',
  photo_url text not null default '',
  goals_count integer not null default 0,
  yellow_cards integer not null default 0,
  red_cards integer not null default 0,
  assists integer not null default 0,
  clean_sheets integer not null default 0,
  suspensions_served integer not null default 0,
  bio text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  team_a_id uuid references public.teams(id) on delete set null,
  team_b_id uuid references public.teams(id) on delete set null,
  team_a_score integer not null default 0,
  team_b_score integer not null default 0,
  match_date timestamptz not null,
  location text not null default '',
  status text not null default 'agendado',
  round integer not null default 1,
  night integer,
  division text not null default 'masculino',
  match_mvp_player_id uuid references public.players(id) on delete set null,
  match_mvp_description text not null default '',
  timer_started_at timestamptz,
  timer_offset_seconds integer not null default 0,
  is_timer_running boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tournament_config (
  id uuid primary key default gen_random_uuid(),
  division text not null default 'masculino',
  current_phase text not null default 'grupos',
  current_round integer not null default 1,
  total_rounds integer not null default 5,
  matches_per_round integer not null default 4,
  group_unit text not null default 'night',
  group_c_visibility jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null default '',
  content text not null default '',
  image_url text not null default '',
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  assistant_id uuid references public.players(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  author_name text not null default '',
  event_type text not null,
  minute integer not null default 0,
  commentary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.match_mvp_votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.match_winner_votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  vote text not null,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.round_mvp_votes (
  id uuid primary key default gen_random_uuid(),
  round integer not null,
  player_id uuid not null references public.players(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  options jsonb not null default '[]'::jsonb,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  endpoint text not null,
  subscription jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  p256dh text,
  auth text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  url text,
  category text,
  important boolean not null default false,
  team_ids jsonb not null default '[]'::jsonb,
  division text,
  action text not null default 'notify',
  created_at timestamptz not null default now()
);

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'client',
  message text not null,
  stack text,
  path text,
  user_agent text,
  app_version text,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title text not null default '',
  description text not null default '',
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gallery_likes (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.gallery(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.gallery_comments (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.gallery(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  comment text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_players_team_id on public.players(team_id);
create index if not exists idx_players_division on public.players(division);
create index if not exists idx_matches_date on public.matches(match_date);
create index if not exists idx_matches_division on public.matches(division);
create index if not exists idx_match_events_match_id on public.match_events(match_id);
create index if not exists idx_match_winner_votes_match_id on public.match_winner_votes(match_id);
create index if not exists idx_round_mvp_votes_round on public.round_mvp_votes(round);
create index if not exists idx_poll_votes_poll_id on public.poll_votes(poll_id);
create unique index if not exists uq_poll_votes_poll_user on public.poll_votes(poll_id, user_id) where user_id is not null;
create unique index if not exists uq_match_winner_votes_match_user on public.match_winner_votes(match_id, user_id) where user_id is not null;
create unique index if not exists uq_match_mvp_votes_match_user on public.match_mvp_votes(match_id, user_id) where user_id is not null;
create unique index if not exists uq_round_mvp_votes_round_user on public.round_mvp_votes(round, user_id) where user_id is not null;
create unique index if not exists uq_push_subscriptions_endpoint on public.push_subscriptions(endpoint);
create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions(user_id);
create index if not exists idx_gallery_likes_gallery_id on public.gallery_likes(gallery_id);
create index if not exists idx_gallery_comments_gallery_id on public.gallery_comments(gallery_id);
create index if not exists idx_client_errors_created_at on public.client_errors(created_at desc);
create index if not exists idx_feedback_reports_created_at on public.feedback_reports(created_at desc);

commit;
