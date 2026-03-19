import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { withTimeout } from '../lib/withTimeout';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingProfile = useRef(false);
  const resolvedOnce = useRef(false);

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
      console.error('Error fetching profile:', err);
      // Não rebaixa para 'user' em erro transitório; mantém o que já tinha/cached.
      const fallback = cached;
      if (fallback) setRole(prev => prev || fallback);
    } finally {
      fetchingProfile.current = false;
    }
  };

  useEffect(() => {
    // Usamos APENAS o onAuthStateChange para gerenciar estado.
    // O evento INITIAL_SESSION dispara automaticamente na montagem,
    // sem precisar chamar getSession() separadamente (que causava lock contention).
    const applySession = async (session: any) => {
      resolvedOnce.current = true;
      if (session?.user) {
        setUser(session.user);
        const cached = getCachedRole(session.user.id);
        if (cached) setRole(prev => prev || cached);
        await fetchProfile(session.user.id);
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

    // Fallback: em alguns refreshes o INITIAL_SESSION pode não disparar.
    // Tentamos recuperar a sessão diretamente sem bloquear indefinidamente.
    const fallbackTimer = setTimeout(() => {
      if (resolvedOnce.current) return;
      void (async () => {
        try {
          const { data, error } = await withTimeout(
            supabase.auth.getSession(),
            15000,
            'Tempo limite ao recuperar sessão'
          );
          if (error) throw error;
          await applySession(data?.session);
        } catch (err) {
          // Se falhar, sai como guest (sem travar UI)
          resolvedOnce.current = true;
          setUser(null);
          setRole(null);
          setLoading(false);
        }
      })();
    }, 1500);

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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
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
    } catch (err: any) {
      console.error('SignOut error:', err);
      toast.error('Erro ao sair: ' + (err.message || 'Erro de rede'));
    }
  };

  return { user, role, loading, signIn, signUp, signOut };
};
