
import { db, doc, updateDoc, collection, addDoc, messaging, getToken, onMessage } from './firebase.ts';
import { playWhistleSound, WhistlePattern } from '../utils/sound.ts';

const VAPID_KEY = "BHT6LWPFyDCj0inYpPKEXBh3rXptm3alhFnLQFcVmPZVscVKdEfz-3-JalE_Fjx8V538kqR46EJ6w4o1JatMins"; // Chave pública VAPID do console Firebase

export const getNotificationStatus = () => {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
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
      alert("As notificações foram bloqueadas. Para recebê-las no celular ou PC, toque no cadeado ou ícone de configurações ao lado do endereço do site e permita as notificações.");
    }
    
    if (permission === 'granted') {
      // Tocar apito de teste para confirmar que o áudio e permissão estão 100% ativos
      playWhistleSound('double');

      if (userId) {
        const userRef = doc(db, "players", userId);
        await updateDoc(userRef, { pushEnabled: true }).catch(() => {});
        
        // Obter Token FCM para notificações em background
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

    // 2. Salvar no Firestore (para histórico e entrega em tempo real para todos os celulares e computadores)
    await addDoc(collection(db, "notifications"), {
      title,
      body,
      createdAt: new Date().toISOString(),
      type: targetStatus === 'pendente' ? 'pending_reminder' : 'broadcast',
      targetStatus,
      soundPattern,
      senderId: senderId || null
    });

    // 3. Chamar a API para disparo imediato via FCM (se configurado)
    await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url: '/', targetStatus, soundPattern })
    }).catch(() => {});

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
