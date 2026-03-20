import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';

export type PushCategories = {
  live: boolean;
  results: boolean;
  news: boolean;
  polls: boolean;
  standings: boolean;
};

export type PushPreferences = {
  categories: PushCategories;
  onlyImportant: boolean;
  favoriteTeamId: string | null;
  preGameReminder: boolean;
};

type PushPreferencesPatch =
  Partial<Omit<PushPreferences, 'categories'>> & {
    categories?: Partial<PushCategories>;
  };

const PUSH_PREFS_KEY = 'copa_unasp_push_preferences_v1';

const DEFAULT_PREFERENCES: PushPreferences = {
  categories: {
    live: true,
    results: true,
    news: true,
    polls: true,
    standings: true,
  },
  onlyImportant: false,
  favoriteTeamId: null,
  preGameReminder: true,
};

const loadPreferences = (): PushPreferences => {
  try {
    const raw = localStorage.getItem(PUSH_PREFS_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<PushPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      categories: {
        ...DEFAULT_PREFERENCES.categories,
        ...(parsed.categories || {}),
      },
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

const persistPreferences = (prefs: PushPreferences) => {
  try {
    localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
};

export const usePushNotifications = () => {
  const { user } = useAuthContext();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [preferences, setPreferences] = useState<PushPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPreferences(loadPreferences());
  }, []);

  useEffect(() => {
    persistPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    let mounted = true;

    const checkAndSyncSubscription = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setLoading(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        if (!registration) return;

        const subscription = await registration.pushManager.getSubscription();
        if (mounted) setIsSubscribed(!!subscription);

        // Se estiver inscrito e o usuário mudou, sincronizar no banco (sem depender de UNIQUE)
        if (subscription && user) {
          const subscriptionWithPrefs = {
            ...(subscription.toJSON() as Record<string, unknown>),
            preferences,
          };

          await supabase
            .from('push_subscriptions')
            .update({ user_id: user.id, subscription: subscriptionWithPrefs })
            .eq('subscription->>endpoint', subscription.endpoint);
        }
      } catch (err) {
        console.debug('Push sync skipped:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    checkAndSyncSubscription();
    return () => { mounted = false; };
  }, [user, preferences]);

  const updatePreferences = async (patch: PushPreferencesPatch) => {
    const next = {
      ...preferences,
      ...patch,
      categories: {
        ...preferences.categories,
        ...(patch.categories || {}),
      },
    };

    setPreferences(next);

    if (!('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;

      await supabase
        .from('push_subscriptions')
        .update({
          user_id: user?.id || null,
          subscription: {
            ...(subscription.toJSON() as Record<string, unknown>),
            preferences: next,
          },
        })
        .eq('subscription->>endpoint', subscription.endpoint);
    } catch (err) {
      console.debug('Push preference sync skipped:', err);
    }
  };

  const subscribe = async () => {
    try {
      setLoading(true);

      if (!window.isSecureContext) {
        throw new Error('Push requer HTTPS (ou localhost).');
      }

      if (!('Notification' in window)) {
        throw new Error('Notificações não suportadas neste navegador.');
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permissão de notificação negada.');
      }

      const registration = await navigator.serviceWorker.ready;
      
      const vapidPublicKey =
        import.meta.env.VITE_VAPID_PUBLIC_KEY ||
        'BCnIZTU55SHGk26e-Eijokx_PKAklTJY8LOwN6kvnRXaz7NGwC2THcjrVG6DR5f2WeRbE9_83cj-xfVWMvp_fqI';

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      // Evita duplicatas (e permite unsubscribe confiável) usando o endpoint do JSON
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('subscription->>endpoint', subscription.endpoint);

      // Salvar no Supabase
      const { error } = await supabase.from('push_subscriptions').insert({
        user_id: user?.id || null,
        subscription: {
          ...(subscription.toJSON() as Record<string, unknown>),
          preferences,
        }
      });

      if (error) throw error;
      setIsSubscribed(true);
    } catch (err) {
      console.error('Push Subscription Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const unsubscribe = async () => {
    try {
      setLoading(true);
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      
      if (subscription) {
        await subscription.unsubscribe();
        
        // Remover do Supabase
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('subscription->>endpoint', subscription.endpoint);
      }
      
      setIsSubscribed(false);
    } catch (err) {
      console.error('Push Unsubscription Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return {
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
    preferences,
    updatePreferences,
  };
};

