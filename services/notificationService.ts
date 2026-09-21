
import { db, doc, updateDoc, collection, addDoc, messaging, getToken, onMessage } from './firebase.ts';

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
      alert("As notificações foram bloqueadas. Para recebê-las, você precisa resetar as permissões no cadeado da barra de endereços do seu navegador.");
    }
    
    if (permission === 'granted' && userId) {
      const userRef = doc(db, "players", userId);
      await updateDoc(userRef, { pushEnabled: true });
      
      // Obter Token FCM para notificações em background
      if (messaging) {
        try {
          // Obter a instância do Service Worker já registrado em index.tsx
          const registration = await navigator.serviceWorker.ready;
          
          const token = await getToken(messaging, { 
            vapidKey: VAPID_KEY,
            serviceWorkerRegistration: registration
          });
          
          if (token) {
            console.log("✅ Token FCM obtido:", token);
            await updateDoc(userRef, { fcmToken: token });
          }
        } catch (err) {
          console.error("❌ Erro ao obter token FCM:", err);
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
        sendPushNotification(payload.notification.title || 'O&A', payload.notification.body || '');
      }
    });
  }
};

export const broadcastNotification = async (title: string, body: string, senderId?: string) => {
  try {
    // 1. Salvar no Firestore (para histórico e fallback)
    await addDoc(collection(db, "notifications"), {
      title,
      body,
      createdAt: new Date().toISOString(),
      type: 'broadcast',
      senderId: senderId || null
    });

    // 2. Chamar a API para disparo imediato (compatível com Vercel)
    await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url: '/' })
    });

  } catch (error) {
    console.error("❌ Erro ao transmitir notificação:", error);
  }
};

export const sendPushNotification = async (title: string, body: string) => {
  if (!('Notification' in window)) {
    console.error("❌ Notificações não são suportadas neste navegador.");
    return;
  }
  
  console.log("🔔 Estado da permissão:", Notification.permission);

  if (Notification.permission === 'denied') {
    console.warn("🚫 Permissão de notificação negada. O usuário precisa resetar as permissões no navegador.");
    return;
  }

  if (Notification.permission !== 'granted') {
    console.warn("🚫 Notificações não permitidas. O sistema só pode solicitar permissão via clique do usuário.");
    return;
  }

  try {
    console.log("🔔 Disparando notificação:", title);
    
    const options = {
      body,
      icon: 'https://images.weserv.nl/?url=https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png&w=192&h=192&fit=contain&padding=10',
      badge: 'https://images.weserv.nl/?url=https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png&w=96&h=96&fit=contain',
      vibrate: [200, 100, 200, 100, 200],
      tag: 'oa-notification-' + Date.now(),
      renotify: true,
      requireInteraction: true,
      data: { url: window.location.origin }
    };

    // Tenta usar o Service Worker primeiro (melhor suporte para background e sistema)
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          console.log("✅ Enviando via Service Worker");
          await registration.showNotification(title, options as any);
          return;
        }
      } catch (swErr) {
        console.warn("⚠️ Falha ao usar Service Worker, tentando fallback:", swErr);
      }
    }
    
    // Fallback para o objeto Notification padrão
    console.log("⚠️ Usando fallback de Notificação padrão");
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
