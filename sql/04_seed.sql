-- sql/04_seed.sql
-- Seeds mínimos para iniciar o projeto.
-- ATENÇÃO: não inclua chaves secretas neste arquivo. Crie o usuário no Auth primeiro
-- usando o painel do Supabase ou a Admin API, pegue o `id` do usuário e cole abaixo.

-- 1) Exemplo de criação de usuário via Admin API (substitua PROJECT_REF e SERVICE_ROLE_KEY):
-- curl -X POST "https://PROJECT_REF.supabase.co/auth/v1/admin/users" \
--  -H "apikey: SERVICE_ROLE_KEY" \
--  -H "Content-Type: application/json" \
--  -d '{"email":"Admincopaunasp@gmail.com","password":"Nl166480*-","email_confirm":true}'

-- 2) Após criar o usuário no Auth, recupere o `id` (UUID) e insira o profile:
-- Substitua <AUTH_USER_UUID> pelo id retornado pelo Admin API ou pelo painel.

INSERT INTO public.profiles (id, email, name, role, created_at, updated_at)
VALUES (
  '7ba6e1b6-ea5a-45c1-8406-8d14dc44c688',
  'Admincopaunasp@gmail.com',
  'Admin CopaUNASP',
  'admin',
  now(),
  now()
);

-- 3) (Opcional) seeds de exemplo para polls e matches
-- Inserir uma enquete de exemplo
INSERT INTO public.polls (id, question, options, active, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Quem foi o destaque da rodada?',
  '[{"id":"opt_0","text":"Jogador A","votes":0},{"id":"opt_1","text":"Jogador B","votes":0}]'::jsonb,
  false,
  now(),
  now()
);

-- Inserir um time e um jogo de exemplo (substitua se já houver dados)
INSERT INTO public.teams (id, name, badge_url, "group", primary_color, division, created_at, updated_at)
VALUES (gen_random_uuid(), 'Time Exemplo A', '', 'A', '#000000', 'masculino', now(), now());

-- Nota: para integrar fully com Auth e ter senhas, crie o usuário via Admin API ou Painel.
