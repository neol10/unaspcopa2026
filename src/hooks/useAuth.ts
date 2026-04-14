import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import toast from 'react-hot-toast';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingProfile = useRef(false);
  const resolvedOnce = useRef(false);

  const isIgnorableAuthAbort = (err: unknown) => {
    const msg =
      typeof (err as { message?: unknown })?.message === 'string'
        ? String((err as { message: string }).message)
        : '';
    const lower = msg.toLowerCase();
    
    // Se o refresh token sumiu, é um erro fatal de sessão, não um "abort" ignorável,
    // mas queremos tratar para não poluir o console ou travar em loading.
    return (
      lower.includes('aborterror')
      || lower.includes("lock broken by another request with the 'steal' option")
      || lower.includes('request was aborted')
      || lower.includes('signal is aborted without reason')
      || lower.includes('refresh token not found')
      || lower.includes('invalid refresh token')
    );
  };

  useEffect(() => {
    const getRoleCacheKey = (uid: string) => `copa_unasp_role_${uid}`;

    const getCachedRole = (uid: string): 'admin' | 'user' | null => {
      try {
        const raw = localStorage.getItem(getRoleCacheKey(uid));
        if (raw === 'admin' || raw === 'user') return raw;
        return null;
      } catch {
        return null;
      }
    };

    const setCachedRole = (uid: string, nextRole: 'admin' | 'user') => {
      try {
        localStorage.setItem(getRoleCacheKey(uid), nextRole);
      } catch {
        // ignore
      }
    };

    const fetchProfile = async (uid: string) => {
      // Evitar chamadas simultâneas ao perfil
      if (fetchingProfile.current) return;
      fetchingProfile.current = true;

      // Carrega cache imediatamente (evita menu sumir por role null)
      const cached = getCachedRole(uid);
      if (cached) setRole(prev => prev || cached);

      try {
        const { data, error } = await supabase.from('profiles').select('role').eq('id', uid).single();
        if (error) throw error;
        const nextRole: 'admin' | 'user' = data?.role === 'admin' ? 'admin' : 'user';
        setRole(nextRole);
        setCachedRole(uid, nextRole);
      } catch (err) {
        if (!isIgnorableAuthAbort(err)) {
          console.error('Error fetching profile:', err);
        }
        // Não rebaixa para 'user' em erro transitório; mantém o que já tinha/cached.
        const fallback = cached;
        if (fallback) setRole(prev => prev || fallback);
      } finally {
        fetchingProfile.current = false;
      }
    };

    // Usamos APENAS o onAuthStateChange para gerenciar estado.
    // O evento INITIAL_SESSION dispara automaticamente na montagem,
    // sem precisar chamar getSession() separadamente (que causava lock contention).
    const applySession = async (session: Session | null) => {
      resolvedOnce.current = true;
      if (session?.user) {
        setUser(session.user);
        const cached = getCachedRole(session.user.id);
        if (cached) setRole(prev => prev || cached);
        // Libera a UI rapidamente e atualiza role em background.
        setLoading(false);
        void fetchProfile(session.user.id);
        return;
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        await applySession(session);
      } else if (event === 'SIGNED_OUT') {
        resolvedOnce.current = true;
        setUser(null);
        setRole(null);
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setUser(session.user);
          const cached = getCachedRole(session.user.id);
          if (cached) setRole(prev => prev || cached);
        }
      }
    });

    // Fallback: tenta recuperar sessão sem forçar guest prematuramente.
    // Isso evita cair em "Acesso Restrito" por corrida transitória de inicialização.
    const fallbackTimer = setTimeout(() => {
      if (resolvedOnce.current) return;
      void (async () => {
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          if (data?.session) {
            await applySession(data.session);
            return;
          }
        } catch (err) {
          if (!isIgnorableAuthAbort(err)) {
            console.warn('Fallback getSession failed:', err);
          }
        }
      })();
    }, 4000);

    // Safety timeout: o GoTrue pode segurar lock por alguns segundos ao inicializar/refresh.
    // Se cairmos em "guest" cedo demais, dá a impressão de deslogar/sumir admin.
    // 12s mantém a proteção contra loading infinito sem ser agressivo demais.
    const timeout = setTimeout(() => {
      setLoading(current => {
        if (current) {
          // Se não conseguir resolver sessão a tempo, segue como guest sem travar a UI.
          return false;
        }
        return current;
      });
    }, 30000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(fallbackTimer);
      clearTimeout(timeout);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const attempt = async () => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    };

    try {
      return await attempt();
    } catch (err) {
      if (!isIgnorableAuthAbort(err)) throw err;

      await new Promise((resolve) => setTimeout(resolve, 700));
      try {
        return await attempt();
      } catch (retryErr) {
        if (isIgnorableAuthAbort(retryErr)) {
          throw new Error('A conexão demorou e o login foi interrompido. Tente novamente.');
        }
        throw retryErr;
      }
    }
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success('Sessão encerrada com sucesso');
    } catch (err: unknown) {
      console.error('SignOut error:', err);
      const message = err instanceof Error ? err.message : 'Erro de rede';
      toast.error('Erro ao sair: ' + message);
    }
  };

  return { user, role, loading, signIn, signUp, signOut };
};

