import { useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

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
  const warnedSyncRef = useRef(false);

  const isPushSupported = () => {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  };

  useEffect(() => {
    setPreferences(loadPreferences());
  }, []);

  useEffect(() => {
    persistPreferences(preferences);
  }, [preferences]);

  const syncSubscriptionRecord = async (
    subscription: PushSubscription,
    prefs: PushPreferences,
    userId: string | null,
  ) => {
    const subscriptionPayload = {
      ...(subscription.toJSON() as Record<string, unknown>),
      preferences: prefs,
    };

    const response = await fetch('/api/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        subscription: subscriptionPayload,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `push-subscription POST failed (${response.status})`);
    }
  };

  useEffect(() => {
    let mounted = true;

    const checkAndSyncSubscription = async () => {
      if (!isPushSupported()) {
        setLoading(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        if (!registration) return;

        const subscription = await registration.pushManager.getSubscription();
        if (mounted) setIsSubscribed(!!subscription);

        // Mantém assinatura persistida no banco mesmo sem usuário logado.
        if (subscription) {
          await syncSubscriptionRecord(subscription, preferences, user?.id || null);
          warnedSyncRef.current = false;
        }
      } catch (err) {
        console.debug('Push sync skipped:', err);
        if (!warnedSyncRef.current) {
          toast.error('Push ativo no dispositivo, mas não sincronizado no servidor. Toque em desativar/ativar alertas.');
          warnedSyncRef.current = true;
        }
        setIsSubscribed(false);
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

    if (!isPushSupported()) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;

      await syncSubscriptionRecord(subscription, next, user?.id || null);
    } catch (err) {
      console.debug('Push preference sync skipped:', err);
      toast.error('Não foi possível salvar preferências de alertas no servidor.');
    }
  };

  const subscribe = async () => {
    try {
      setLoading(true);

      if (!window.isSecureContext) {
        throw new Error('Push requer HTTPS (ou localhost).');
      }

      if (!isPushSupported()) {
        throw new Error('Push não suportado neste navegador/dispositivo.');
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

      await syncSubscriptionRecord(subscription, preferences, user?.id || null);
      setIsSubscribed(true);
      toast.success('Alertas ativados com sucesso!');
    } catch (err) {
      console.error('Push Subscription Error:', err);
      const message = err instanceof Error ? err.message : 'Falha ao ativar alertas push.';
      toast.error(message);
      setIsSubscribed(false);
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

        await fetch('/api/push-subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
      
      setIsSubscribed(false);
      toast.success('Alertas desativados.');
    } catch (err) {
      console.error('Push Unsubscription Error:', err);
      toast.error('Falha ao desativar alertas push.');
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

