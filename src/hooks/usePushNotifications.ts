import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthContext } from '../contexts/AuthContext';

export const usePushNotifications = () => {
  const { user } = useAuthContext();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const checkSubscription = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setLoading(false);
        return;
      }

      try {
        // Timeout de 1s p/ checagem - falha rápida é melhor que travamento
        const swTimeout = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('SW Timeout')), 1000)
        );
        
        const registration = await (Promise.race([
          navigator.serviceWorker.ready,
          swTimeout
        ]) as Promise<ServiceWorkerRegistration>).catch(() => null);

        if (registration && mounted) {
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        }
      } catch (err) {
        console.debug('Push check skipped:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    checkSubscription();
    return () => { mounted = false; };
  }, [user]);

  const subscribe = async () => {
    try {
      setLoading(true);
      const registration = await navigator.serviceWorker.ready;
      
      // Chave pública VAPID (Deve ser gerada no backend/env em prod real)
      // Aqui usamos um placeholder ou deixamos sem para que o browser peça permissão
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: 'BCnIZTU55SHGk26e-Eijokx_PKAklTJY8LOwN6kvnRXaz7NGwC2THcjrVG6DR5f2WeRbE9_83cj-xfVWMvp_fqI'
      });

      // Salvar no Supabase
      const { error } = await supabase.from('push_subscriptions').insert({
        user_id: user?.id || null,
        subscription: subscription.toJSON()
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
          .match({ subscription: JSON.stringify(subscription) });
      }
      
      setIsSubscribed(false);
    } catch (err) {
      console.error('Push Unsubscription Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return { isSubscribed, loading, subscribe, unsubscribe };
};
