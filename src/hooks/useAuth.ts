import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import toast from 'react-hot-toast';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'admin' | 'user' | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchingProfile = useRef(false);

  const fetchProfile = async (uid: string) => {
    // Evitar chamadas simultâneas ao perfil
    if (fetchingProfile.current) return;
    fetchingProfile.current = true;
    try {
      const { data, error } = await supabase.from('profiles').select('role').eq('id', uid).single();
      if (error) throw error;
      setRole(data?.role || 'user');
    } catch (err) {
      console.error('Error fetching profile:', err);
      setRole(prev => prev || 'user');
    } finally {
      fetchingProfile.current = false;
    }
  };

  useEffect(() => {
    // Usamos APENAS o onAuthStateChange para gerenciar estado.
    // O evento INITIAL_SESSION dispara automaticamente na montagem,
    // sem precisar chamar getSession() separadamente (que causava lock contention).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else {
          setUser(null);
          setRole(null);
        }
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setRole(null);
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED') {
        // Apenas atualiza o objeto user sem rebuscar profile
        if (session?.user) setUser(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
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
