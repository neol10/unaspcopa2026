-- Add Group C visibility controls used by the Admin panel.
-- Safe to run multiple times.

alter table if exists public.tournament_config
  add column if not exists group_c_visibility jsonb not null default '{
    "teams": false,
    "players": false,
    "standings": false,
    "favorite_team_menu": false
  }'::jsonb;
