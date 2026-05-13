-- Adiciona suporte a duas categorias (Masculino/Feminino) via coluna `division`.
-- Execute este script no SQL Editor do Supabase.

-- 1) Colunas (default = masculino para não quebrar dados existentes)
alter table if exists public.teams
  add column if not exists division text not null default 'masculino';

alter table if exists public.players
  add column if not exists division text not null default 'masculino';

alter table if exists public.matches
  add column if not exists division text not null default 'masculino';

alter table if exists public.tournament_config
  add column if not exists division text not null default 'masculino';

-- 2) Constraints (valores permitidos)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_division_check') then
    alter table public.teams add constraint teams_division_check check (division in ('masculino', 'feminino'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'players_division_check') then
    alter table public.players add constraint players_division_check check (division in ('masculino', 'feminino'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'matches_division_check') then
    alter table public.matches add constraint matches_division_check check (division in ('masculino', 'feminino'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tournament_config_division_check') then
    alter table public.tournament_config add constraint tournament_config_division_check check (division in ('masculino', 'feminino'));
  end if;
end $$;

-- 3) Índices (performance)
create index if not exists idx_teams_division on public.teams (division);
create index if not exists idx_players_division on public.players (division);
create index if not exists idx_matches_division_match_date on public.matches (division, match_date);

-- 4) Garante 1 linha de config por divisão
create unique index if not exists uq_tournament_config_division on public.tournament_config (division);
