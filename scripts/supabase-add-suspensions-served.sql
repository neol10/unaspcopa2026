begin;

-- Automatiza controle de suspensão cumprida.
-- A regra de suspensão (ganha) continua no app: 2 amarelos = 1 jogo; 1 vermelho = 1 jogo.
-- Este campo guarda quantas suspensões o jogador já cumpriu (para não ficar sempre "SUSPENSO").

alter table public.players
  add column if not exists suspensions_served integer not null default 0;

-- Garantir que nunca fique negativo (opcional)
alter table public.players
  drop constraint if exists players_suspensions_served_non_negative;

alter table public.players
  add constraint players_suspensions_served_non_negative
  check (suspensions_served >= 0);

commit;
