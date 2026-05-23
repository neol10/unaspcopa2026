begin;

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.tournament_config enable row level security;
alter table public.news enable row level security;
alter table public.match_events enable row level security;
alter table public.match_mvp_votes enable row level security;
alter table public.match_winner_votes enable row level security;
alter table public.round_mvp_votes enable row level security;
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.client_errors enable row level security;
alter table public.gallery enable row level security;
alter table public.gallery_likes enable row level security;
alter table public.gallery_comments enable row level security;
alter table public.feedback_reports enable row level security;

-- Public read surfaces
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
using (auth.uid() = id or public.is_admin(auth.uid()));

drop policy if exists "teams_select_all" on public.teams;
create policy "teams_select_all"
on public.teams
for select
to anon, authenticated
using (true);

drop policy if exists "players_select_all" on public.players;
create policy "players_select_all"
on public.players
for select
to anon, authenticated
using (true);

drop policy if exists "matches_select_all" on public.matches;
create policy "matches_select_all"
on public.matches
for select
to anon, authenticated
using (true);

drop policy if exists "tournament_config_select_all" on public.tournament_config;
create policy "tournament_config_select_all"
on public.tournament_config
for select
to anon, authenticated
using (true);

drop policy if exists "news_select_all" on public.news;
create policy "news_select_all"
on public.news
for select
to anon, authenticated
using (true);

drop policy if exists "match_events_select_all" on public.match_events;
create policy "match_events_select_all"
on public.match_events
for select
to anon, authenticated
using (true);

drop policy if exists "polls_select_all" on public.polls;
create policy "polls_select_all"
on public.polls
for select
to anon, authenticated
using (true);

drop policy if exists "gallery_select_all" on public.gallery;
create policy "gallery_select_all"
on public.gallery
for select
to anon, authenticated
using (true);

drop policy if exists "gallery_likes_select_all" on public.gallery_likes;
create policy "gallery_likes_select_all"
on public.gallery_likes
for select
to anon, authenticated
using (true);

drop policy if exists "gallery_comments_select_all" on public.gallery_comments;
create policy "gallery_comments_select_all"
on public.gallery_comments
for select
to anon, authenticated
using (true);

-- Admin-managed tables
drop policy if exists "teams_admin_write" on public.teams;
create policy "teams_admin_write"
on public.teams
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "players_admin_write" on public.players;
create policy "players_admin_write"
on public.players
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "matches_admin_write" on public.matches;
create policy "matches_admin_write"
on public.matches
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "tournament_config_admin_write" on public.tournament_config;
create policy "tournament_config_admin_write"
on public.tournament_config
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "news_admin_write" on public.news;
create policy "news_admin_write"
on public.news
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "match_events_admin_write" on public.match_events;
create policy "match_events_admin_write"
on public.match_events
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "polls_admin_write" on public.polls;
create policy "polls_admin_write"
on public.polls
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "push_subscriptions_admin_select" on public.push_subscriptions;
create policy "push_subscriptions_admin_select"
on public.push_subscriptions
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "notifications_admin_select" on public.notifications;
create policy "notifications_admin_select"
on public.notifications
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "client_errors_admin_select" on public.client_errors;
create policy "client_errors_admin_select"
on public.client_errors
for select
to authenticated
using (public.is_admin(auth.uid()));

-- Voting data is readable by admin, but writes come from the app or server side helpers.
drop policy if exists "match_mvp_votes_admin_select" on public.match_mvp_votes;
create policy "match_mvp_votes_admin_select"
on public.match_mvp_votes
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "match_winner_votes_admin_select" on public.match_winner_votes;
create policy "match_winner_votes_admin_select"
on public.match_winner_votes
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "round_mvp_votes_admin_select" on public.round_mvp_votes;
create policy "round_mvp_votes_admin_select"
on public.round_mvp_votes
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "poll_votes_admin_select" on public.poll_votes;
create policy "poll_votes_admin_select"
on public.poll_votes
for select
to authenticated
using (public.is_admin(auth.uid()));

-- User-generated surfaces
drop policy if exists "gallery_likes_insert_own" on public.gallery_likes;
create policy "gallery_likes_insert_own"
on public.gallery_likes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "gallery_likes_delete_own_or_admin" on public.gallery_likes;
create policy "gallery_likes_delete_own_or_admin"
on public.gallery_likes
for delete
to authenticated
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "gallery_comments_insert_own" on public.gallery_comments;
create policy "gallery_comments_insert_own"
on public.gallery_comments
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "gallery_comments_update_own_or_admin" on public.gallery_comments;
create policy "gallery_comments_update_own_or_admin"
on public.gallery_comments
for update
to authenticated
using (auth.uid() = user_id or public.is_admin(auth.uid()))
with check (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "gallery_comments_delete_own_or_admin" on public.gallery_comments;
create policy "gallery_comments_delete_own_or_admin"
on public.gallery_comments
for delete
to authenticated
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "feedback_reports_insert_anyone" on public.feedback_reports;
create policy "feedback_reports_insert_anyone"
on public.feedback_reports
for insert
to anon, authenticated
with check (true);

drop policy if exists "feedback_reports_admin_select" on public.feedback_reports;
create policy "feedback_reports_admin_select"
on public.feedback_reports
for select
to authenticated
using (public.is_admin(auth.uid()));

drop policy if exists "feedback_reports_admin_update" on public.feedback_reports;
create policy "feedback_reports_admin_update"
on public.feedback_reports
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "feedback_reports_admin_delete" on public.feedback_reports;
create policy "feedback_reports_admin_delete"
on public.feedback_reports
for delete
to authenticated
using (public.is_admin(auth.uid()));

commit;
