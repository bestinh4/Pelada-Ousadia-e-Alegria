
import { db, doc, updateDoc, collection, addDoc, getDocs, query, where, messaging, getToken, onMessage } from './firebase.ts';
import { playWhistleSound, WhistlePattern } from '../utils/sound.ts';
import { VAPID_PUBLIC_KEY } from '../constants/vapid.ts';

const VAPID_KEY = VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const getNotificationStatus = () => {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

/**
 * Garante silenciosamente que o atleta autenticado com permissão ativa
 * tenha a inscrição W3C Web Push registrada e atualizada no Firestore.
 */
export const syncPushSubscription = async (userId: string) => {
  if (!userId || typeof window === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }

    if (subscription) {
      const subJson = subscription.toJSON();
      await updateDoc(doc(db, "players", userId), {
        pushEnabled: true,
        pushSubscription: subJson,
        lastPushSyncAt: new Date().toISOString()
      }).catch(() => {});
    }
  } catch (err) {
    console.warn("Aviso ao sincronizar push subscription silenciosamente:", err);
  }
};

export const requestNotificationPermission = async (userId?: string) => {
  if (!('Notification' in window)) {
    console.warn('⚠️ Notificações não suportadas neste navegador.');
    return false;
  }

  try {
    console.log('🔔 Solicitando permissão de notificação...');
    const permission = await Notification.requestPermission();
    console.log('🔔 Status da permissão:', permission);
    
    if (permission === 'denied') {
      alert("As notificações foram bloqueadas. Para recebê-las no celular ou PC mesmo com o app fechado, toque no cadeado ou ícone de configurações ao lado do endereço do site e permita as notificações.");
    }
    
    if (permission === 'granted') {
      // Tocar apito de teste para confirmar que o áudio e permissão estão 100% ativos
      playWhistleSound('double');

      if (userId) {
        const userRef = doc(db, "players", userId);
        await updateDoc(userRef, { pushEnabled: true }).catch(() => {});
        
        // 1. Inscrever no padrão W3C Web Push para entrega com app fechado
        if ('serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
              subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
              });
            }

            if (subscription) {
              const subJson = subscription.toJSON();
              await updateDoc(userRef, {
                pushEnabled: true,
                pushSubscription: subJson,
                pushSubscribedAt: new Date().toISOString()
              }).catch(() => {});
              console.log("✅ Inscrição Web Push para background salva com sucesso!");
            }
          } catch (subErr) {
            console.warn("⚠️ Aviso ao registrar inscrição Web Push:", subErr);
          }
        }

        // 2. Obter Token FCM como contingência
        if (messaging) {
          try {
            const registration = await navigator.serviceWorker.ready;
            const token = await getToken(messaging, { 
              vapidKey: VAPID_KEY,
              serviceWorkerRegistration: registration
            });
            
            if (token) {
              console.log("✅ Token FCM obtido:", token);
              await updateDoc(userRef, { fcmToken: token }).catch(() => {});
            }
          } catch (err) {
            console.error("❌ Erro ao obter token FCM:", err);
          }
        }
      }
    }
    return permission === 'granted';
  } catch (error) {
    console.error("❌ Erro ao solicitar permissão:", error);
    return false;
  }
};

export const setupForegroundNotifications = () => {
  if (messaging) {
    onMessage(messaging, (payload) => {
      console.log('📥 Notificação em foreground recebida:', payload);
      if (payload.notification) {
        sendPushNotification(payload.notification.title || 'O&A', payload.notification.body || '', 'single');
      }
    });
  }
};

export const broadcastNotification = async (
  title: string,
  body: string,
  senderId?: string,
  targetStatus: 'all' | 'pendente' = 'all',
  soundPattern: WhistlePattern = 'single'
) => {
  try {
    // 1. Tocar som de apito localmente imediatamente para o usuário atual
    playWhistleSound(soundPattern);

    // 2. Salvar no Firestore (para histórico e entrega em tempo real para todos os celulares e computadores conectados)
    await addDoc(collection(db, "notifications"), {
      title,
      body,
      createdAt: new Date().toISOString(),
      type: targetStatus === 'pendente' ? 'pending_reminder' : 'broadcast',
      targetStatus,
      soundPattern,
      senderId: senderId || null
    });

    // 3. Buscar todas as inscrições Web Push registradas no Firestore para entrega mesmo com app FECHADO
    let subscriptions: any[] = [];
    try {
      const qPlayers = query(collection(db, "players"), where("pushEnabled", "==", true));
      const playersSnap = await getDocs(qPlayers);
      playersSnap.forEach((docSnap) => {
        const p = docSnap.data();
        if (targetStatus === 'pendente') {
          const st = p.status || 'pendente';
          if (st !== 'pendente') return;
        }
        if (p.pushSubscription && p.pushSubscription.endpoint) {
          subscriptions.push(p.pushSubscription);
        }
      });
      console.log(`📱 Encontradas ${subscriptions.length} inscrições para envio com app fechado.`);
    } catch (qErr) {
      console.warn("Aviso ao buscar push subscriptions dos atletas:", qErr);
    }

    // 4. Chamar a API server-side para envio do Web Push em background
    await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        title, 
        body, 
        url: '/', 
        targetStatus, 
        soundPattern,
        subscriptions
      })
    }).catch((err) => {
      console.warn("Aviso ao disparar Web Push no servidor:", err);
    });

  } catch (error) {
    console.error("❌ Erro ao transmitir notificação:", error);
  }
};

/**
 * Dispara lembrete push exclusivo para atletas com status 'pendente'
 * incentivando a confirmação na lista antes do fechamento.
 */
export const sendPendingAthletesReminder = async (
  match?: { date?: string; time?: string; location?: string } | null,
  senderId?: string,
  isAutomaticEve: boolean = false
) => {
  const matchTime = match?.time || '07:30';
  const location = match?.location || 'Granja Cantinho do Céu';
  const title = isAutomaticEve
    ? '⏰ VÉSPERA DA PELADA • CONFIRME SUA PRESENÇA!'
    : '⚽ VOCÊ AINDA NÃO COLOCOU O NOME NA LISTA!';
  const body = isAutomaticEve
    ? `Amanhã tem pelada às ${matchTime} (${location}) e seu nome ainda não foi confirmado! Toque para colocar seu nome antes das 18h.`
    : `Seu status ainda consta como PENDENTE na pelada (${location} às ${matchTime}). Acesse o App agora e confirme sua vaga na lista!`;

  await broadcastNotification(title, body, senderId, 'pendente', 'single');
};

export const sendPushNotification = async (
  title: string, 
  body: string, 
  soundPattern: WhistlePattern = 'single'
) => {
  // Sempre tocar o apito do juiz sintetizado via Web Audio API
  playWhistleSound(soundPattern);

  if (!('Notification' in window)) {
    console.error("❌ Notificações não são suportadas neste navegador.");
    return;
  }
  
  if (Notification.permission !== 'granted') {
    console.warn("🚫 Notificações não permitidas pelo usuário.");
    return;
  }

  try {
    const vibratePattern = soundPattern === 'triple' 
      ? [200, 100, 200, 100, 450]
      : soundPattern === 'double'
        ? [200, 100, 250]
        : soundPattern === 'start'
          ? [500]
          : [200];

    const options = {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      vibrate: vibratePattern,
      tag: 'oa-notification-' + Date.now(),
      renotify: true,
      requireInteraction: true,
      data: { url: window.location.origin }
    };

    // Tenta usar o Service Worker primeiro (melhor suporte no celular / Android)
    if ('serviceWorker' in navigator) {
      try {
        const swReadyPromise = navigator.serviceWorker.ready;
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000));
        const registration = await Promise.race([swReadyPromise, timeoutPromise]);
        
        if (registration && registration.showNotification) {
          await registration.showNotification(title, options as any);
          return;
        }
      } catch (swErr) {
        console.warn("⚠️ Falha ao usar Service Worker, tentando fallback:", swErr);
      }
    }
    
    // Fallback para o objeto Notification padrão
    const notif = new Notification(title, { 
      body: options.body, 
      icon: options.icon,
      tag: options.tag
    });
    
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch (error) {
    console.error("❌ Erro ao disparar notificação:", error);
  }
};

export const resetNotificationsRoutine = async (userId?: string) => {
  console.log("🔄 Iniciando rotina de reset de notificações...");
  
  try {
    // 1. Limpar Caches do Navegador
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
      console.log("✅ Caches de armazenamento limpos.");
    }

    // 2. Unregister Service Workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        // Enviar comando de limpar cache antes de desregistrar
        if (registration.active) {
          registration.active.postMessage({ type: 'CLEAR_CACHE' });
          registration.active.postMessage({ type: 'RESET_NOTIFICATIONS' });
        }
        await registration.unregister();
        console.log("✅ Service Worker desregistrado.");
      }

      // 3. Re-registrar Service Worker
      const newReg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log("✅ Novo Service Worker registrado:", newReg.scope);
      
      // Aguardar o SW ficar pronto
      await navigator.serviceWorker.ready;
    }

    // 4. Re-solicitar permissão e atualizar Token
    if (userId) {
      console.log("🔔 Re-sincronizando permissões para o usuário:", userId);
      await requestNotificationPermission(userId);
    }

    alert("Rotina de limpeza concluída! As notificações foram resetadas e o cache foi limpo.");
    return true;
  } catch (err) {
    console.error("❌ Erro na rotina de reset:", err);
    alert("Ocorreu um erro ao resetar as notificações. Tente recarregar a página.");
    return false;
  }
};
