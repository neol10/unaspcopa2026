-- Script para criar trigger de sincronização automática entre auth.users e public.profiles
-- E correção de RLS recursivo (fim do Erro 500 no Supabase ao carregar estatísticas)

-- 1. Cria a função de sincronização do perfil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, created_at, updated_at)
  VALUES (
    new.id,
    new.email,
    split_part(new.email, '@', 1),
    'user',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Cria a trigger na tabela auth.users (caso não exista)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Sincroniza retroativamente todos os usuários existentes de auth.users que ainda não possuem perfil em public.profiles
INSERT INTO public.profiles (id, email, name, role, created_at, updated_at)
SELECT 
  id, 
  email, 
  split_part(email, '@', 1), 
  'user', 
  created_at, 
  updated_at
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 4. Remove a política RLS que causava recursão infinita (Infinite Recursion) no banco de dados e gerava erros 500
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;

-- 5. Cria a nova política que permite leitura pública de perfis (essencial para exibição de autoria de lances e votos)
CREATE POLICY profiles_select_all ON public.profiles 
  FOR SELECT USING (true);
