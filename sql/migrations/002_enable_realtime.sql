-- Migration: Habilita o Supabase Realtime para as tabelas principais do projeto
-- Com isso, eventos de partidas, gols, atualizações de placar e informações de jogadores são replicados instantaneamente.

ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tournament_config;
