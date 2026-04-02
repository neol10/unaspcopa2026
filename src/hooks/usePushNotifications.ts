import { useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';

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
const PUSH_SYNC_VERSION_KEY = 'copa_unasp_push_sync_version';
const PUSH_SYNC_VERSION = 'v5';

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

const getServerVapidPublicKey = async (): Promise<string> => {
  try {
    const response = await fetch(`/api/push-public-key?t=${Date.now()}`, { method: 'GET' });
    if (!response.ok) throw new Error(`push-public-key failed (${response.status})`);
    const data = (await response.json()) as { publicKey?: unknown };
    if (typeof data.publicKey === 'string' && data.publicKey.trim()) {
      return data.publicKey.trim();
    }
  } catch {
    // fallback below
  }

  const fallback = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim();
  if (fallback) return fallback;
  throw new Error('Chave pública VAPID indisponível.');
};

export const usePushNotifications = () => {
  const { user, loading: authLoading } = useAuthContext();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [preferences, setPreferences] = useState<PushPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const warnedSyncRef = useRef(false);

  const isPushSupported = () => {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  };

  const isStandalone = () => {
    const nav: any = window.navigator;
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone;
  };

  const isIOS = () => {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  };

  const getServiceWorkerRegistration = async (ensure = false) => {
    let registration = await navigator.serviceWorker.getRegistration();
    if (registration) return registration;
    if (!ensure) return null;
    try {
      registration = await navigator.serviceWorker.register('/sw.js');
      return registration;
    } catch {
      return null;
    }
  };

  const markPushSyncVersion = () => {
    try {
      localStorage.setItem(PUSH_SYNC_VERSION_KEY, PUSH_SYNC_VERSION);
    } catch {
      // ignore
    }
  };

  const isPushSyncCurrent = () => {
    try {
      return localStorage.getItem(PUSH_SYNC_VERSION_KEY) === PUSH_SYNC_VERSION;
    } catch {
      return false;
    }
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

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch('/api/push-subscription', {
      method: 'POST',
      headers,
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

  const removeSubscriptionRecord = async (endpoint: string, token?: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    await fetch('/api/push-subscription', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ endpoint }),
    });
  };

  useEffect(() => {
    let mounted = true;

    const checkAndSyncSubscription = async () => {
      if (authLoading) return;

      if (!isPushSupported()) {
        setLoading(false);
        return;
      }

      // iOS não permite inscrição automática sem gesto do usuário.
      // E só suporta push se estiver em modo 'standalone' (Home Screen).
      if (isIOS() && !isStandalone()) {
        setLoading(false);
        return;
      }

      try {
        const registration = await getServiceWorkerRegistration();
        if (!registration || !mounted) {
          setLoading(false);
          return;
        }

        let subscription = await registration.pushManager.getSubscription();
        if (mounted) setIsSubscribed(!!subscription);

        if (!user) {
          warnedSyncRef.current = false;
          setLoading(false);
          return;
        }

        // Somente tenta re-inscrever automaticamente se NÃO for iOS (ou se já tiver permissão e for standalone)
        const canAutoSubscribe = !isIOS() || (isStandalone() && Notification.permission === 'granted');

        if (!subscription && Notification.permission === 'granted' && canAutoSubscribe) {
          const vapidPublicKey = await getServerVapidPublicKey();
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });
          markPushSyncVersion();
        }

        if (subscription && !isPushSyncCurrent() && canAutoSubscribe) {
          // Em vez de forçar unsubscribe/subscribe (que falha no Android em background),
          // apenas re-sincronizamos o registro atual com a nova versão.
          await syncSubscriptionRecord(subscription, preferences, user?.id || null);
          markPushSyncVersion();
        }

        if (subscription && mounted) {
          await syncSubscriptionRecord(subscription, preferences, user?.id || null);
          warnedSyncRef.current = false;
          setIsSubscribed(true);
        }
      } catch (err) {
        console.debug('Push sync skipped:', err);
        // Evita spam de erro no console do iPhone
      } finally {
        if (mounted) setLoading(false);
      }
    };

    checkAndSyncSubscription();
    return () => { mounted = false; };
  }, [user, preferences, authLoading]);

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
      const registration = await getServiceWorkerRegistration(true);
      if (!registration) {
        throw new Error('Service Worker nao registrado. Recarregue o app.');
      }
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

      if (!user) {
        throw new Error('Faça login para ativar alertas.');
      }

      if (!window.isSecureContext) {
        throw new Error('Push requer HTTPS (ou localhost).');
      }

      if (!isPushSupported()) {
        throw new Error('Push não suportado neste navegador/dispositivo.');
      }

      if (isIOS() && !isStandalone()) {
        throw new Error('No iPhone, as notificações só funcionam se você adicionar o app à Tela de Início primeiro.');
      }

      if (!('Notification' in window)) {
        throw new Error('Notificações não suportadas neste navegador.');
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permissão de notificação negada. Verifique as configurações do iOS.');
      }

      const registration = await getServiceWorkerRegistration(true);
      if (!registration) {
        throw new Error('Service Worker nao registrado. Recarregue o app.');
      }
      const vapidPublicKey = await getServerVapidPublicKey();

      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await existing.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });

      await syncSubscriptionRecord(subscription, preferences, user?.id || null);
      markPushSyncVersion();
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

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        await removeSubscriptionRecord(subscription.endpoint, token);
      }
      
      setIsSubscribed(false);
      try {
        localStorage.removeItem(PUSH_SYNC_VERSION_KEY);
      } catch {
        // ignore
      }
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

