begin;

alter table if exists public.teams
  add column if not exists division text not null default 'masculino';

alter table if exists public.players
  add column if not exists division text not null default 'masculino',
  add column if not exists suspensions_served integer not null default 0;

alter table if exists public.matches
  add column if not exists division text not null default 'masculino',
  add column if not exists night integer,
  add column if not exists timer_started_at timestamptz,
  add column if not exists timer_offset_seconds integer not null default 0,
  add column if not exists is_timer_running boolean not null default false;

alter table if exists public.tournament_config
  add column if not exists division text not null default 'masculino',
  add column if not exists group_unit text not null default 'night',
  add column if not exists group_c_visibility jsonb not null default '{}'::jsonb;

create unique index if not exists uq_tournament_config_division on public.tournament_config(division);

create or replace function public.validate_match_integrity()
returns trigger
language plpgsql
as $$
declare
  allowed_statuses text[] := array['agendado', 'ao_vivo', 'finalizado', 'cancelado'];
begin
  if new.team_a_id is not null and new.team_b_id is not null and new.team_a_id = new.team_b_id then
    raise exception 'Uma partida nao pode usar o mesmo time dos dois lados';
  end if;

  if new.status is not null and not (new.status = any (allowed_statuses)) then
    raise exception 'Status de partida invalido: %', new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_match_integrity on public.matches;
create trigger trg_validate_match_integrity
before insert or update on public.matches
for each row
execute function public.validate_match_integrity();

commit;
