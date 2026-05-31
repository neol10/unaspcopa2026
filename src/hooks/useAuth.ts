import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import toast from 'react-hot-toast';
import { withTimeout } from '../lib/withTimeout';
import { fetchPublicData } from '../lib/apiData';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingProfile = useRef(false);
  const resolvedOnce = useRef(false);
  const lastKnownRole = useRef<'admin' | 'user' | null>(null);
  const lastKnownUser = useRef<User | null>(null);
  const signedOutGrace = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizeEmail = (value: string) => value.trim().toLowerCase();

  const ensureGmailEmail = (value: string) => {
    const normalized = normalizeEmail(value);
    if (!normalized.endsWith('@gmail.com')) {
      throw new Error('Só é permitido entrar/cadastrar com email @gmail.com.');
    }
    return normalized;
  };

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
        const data = await fetchPublicData<{ role: 'admin' | 'user' }>('profile_role', { uid });
        const nextRole: 'admin' | 'user' = data?.role === 'admin' ? 'admin' : 'user';
        setRole(nextRole);
        setCachedRole(uid, nextRole);
      } catch (err) {
        if (!isIgnorableAuthAbort(err)) {
          console.warn('Profile lookup failed, using cached/default role.', err);
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
      // Cancela qualquer grace timer pendente de SIGNED_OUT
      if (signedOutGrace.current) {
        clearTimeout(signedOutGrace.current);
        signedOutGrace.current = null;
      }
      if (session?.user) {
        setUser(session.user);
        lastKnownUser.current = session.user;
        const cached = getCachedRole(session.user.id);
        if (cached) setRole(prev => {
          const next = prev || cached;
          lastKnownRole.current = next;
          return next;
        });
        // Libera a UI rapidamente e atualiza role em background.
        setLoading(false);
        void fetchProfile(session.user.id);
        return;
      } else {
        setUser(null);
        setRole(null);
        lastKnownUser.current = null;
        lastKnownRole.current = null;
      }
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        await applySession(session);
      } else if (event === 'SIGNED_OUT') {
        // No celular, SIGNED_OUT pode ser disparado por timeout de rede temporário.
        // Damos um grace period de 4s: se uma nova sessão chegar nesse tempo, ignoramos o logout.
        signedOutGrace.current = setTimeout(() => {
          signedOutGrace.current = null;
          resolvedOnce.current = true;
          setUser(null);
          setRole(null);
          lastKnownRole.current = null;
          lastKnownUser.current = null;
          setLoading(false);
        }, 4000);
      } else if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setUser(session.user);
          lastKnownUser.current = session.user;
          const cached = getCachedRole(session.user.id);
          if (cached) setRole(prev => {
            const next = prev || cached;
            lastKnownRole.current = next;
            return next;
          });
        }
      }
    });

    // Safety timeout: se a sessão não resolver em 10s, libera a UI como guest.
    // Isso evita tela branca/spinner infinito em dispositivos lentos ou rede instável.
    const timeout = setTimeout(() => {
      setLoading(current => {
        if (current) return false;
        return current;
      });
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
      if (signedOutGrace.current) clearTimeout(signedOutGrace.current);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const gmailEmail = ensureGmailEmail(email);
    const attempt = async () => {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: gmailEmail, password }),
        15000,
        'O login demorou demais e foi interrompido. Tente novamente.',
      );
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
    const gmailEmail = ensureGmailEmail(email);
    const { data, error } = await withTimeout(
      supabase.auth.signUp({ email: gmailEmail, password }),
      15000,
      'O cadastro demorou demais e foi interrompido. Tente novamente.',
    );
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

