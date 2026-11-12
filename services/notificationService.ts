import {
  auth,
  db,
  doc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  messaging,
  getToken,
  onMessage,
} from './firebase.ts';
import { playWhistleSound, WhistlePattern } from '../utils/sound.ts';
import { VAPID_PUBLIC_KEY } from '../constants/vapid.ts';

const VAPID_KEY = VAPID_PUBLIC_KEY;
const MY_ENDPOINT_STORAGE_KEY = 'oa_my_push_endpoint';
const FCM_SKIP_UNTIL_KEY = 'oa_fcm_skip_until';
let lastSyncAttemptMs = 0;

function shouldAttemptFcmToken(): boolean {
  if (!messaging) return false;
  try {
    const skipUntil = Number(localStorage.getItem(FCM_SKIP_UNTIL_KEY) || '0');
    if (skipUntil && Date.now() < skipUntil) {
      return false;
    }
  } catch {}
  return true;
}

async function safeTryGetFcmToken(registration: ServiceWorkerRegistration): Promise<string | null> {
  if (!shouldAttemptFcmToken() || !messaging) return null;
  try {
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    return token || null;
  } catch {
    // Evita repetir POST 401 para fcmregistrations.googleapis.com a cada foco/visibilidade;
    // W3C Web Push (pushManager.subscribe) continua 100% ativo sem depender do endpoint FCM.
    try {
      localStorage.setItem(FCM_SKIP_UNTIL_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
    } catch {}
    return null;
  }
}

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

function isSameApplicationServerKey(subscription: PushSubscription, vapidPublicKey: string): boolean {
  try {
    const existingKeyBuffer = subscription.options?.applicationServerKey;
    if (!existingKeyBuffer) return false;
    const existingBytes = new Uint8Array(existingKeyBuffer);
    const expectedBytes = urlBase64ToUint8Array(vapidPublicKey);
    if (existingBytes.length !== expectedBytes.length) return false;
    for (let i = 0; i < existingBytes.length; i++) {
      if (existingBytes[i] !== expectedBytes[i]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const idToken = await auth.currentUser?.getIdToken?.();
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }
  } catch {}
  return headers;
}

async function ensureActivePushSubscription(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !isSameApplicationServerKey(subscription, VAPID_PUBLIC_KEY)) {
    try {
      await subscription.unsubscribe();
    } catch {}
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return subscription;
}

async function savePushDataToPlayerDocs(
  userId: string,
  playerDocId: string | undefined,
  payload: Record<string, any>
) {
  const targetIds = new Set<string>([userId]);
  if (playerDocId && playerDocId !== userId) {
    targetIds.add(playerDocId);
  }
  await Promise.allSettled(
    Array.from(targetIds).map((id) =>
      setDoc(doc(db, 'players', id), payload, { merge: true }).catch(() =>
        updateDoc(doc(db, 'players', id), payload)
      )
    )
  );
}

export const getNotificationStatus = () => {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

/**
 * Garante silenciosamente que o atleta autenticado com permissão ativa
 * tenha a inscrição W3C Web Push (com chave VAPID validada) e token FCM salvos no Firestore.
 */
export const syncPushSubscription = async (userId: string, playerDocId?: string) => {
  if (!userId || typeof window === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  const now = Date.now();
  if (now - lastSyncAttemptMs < 8000) return;
  lastSyncAttemptMs = now;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await ensureActivePushSubscription(registration);
    const updates: Record<string, any> = {
      pushEnabled: true,
      lastPushSyncAt: new Date().toISOString(),
    };

    if (subscription) {
      const subJson = subscription.toJSON();
      updates.pushSubscription = subJson;
      try {
        if (subJson.endpoint) {
          localStorage.setItem(MY_ENDPOINT_STORAGE_KEY, subJson.endpoint);
        }
      } catch {}
    }

    const token = await safeTryGetFcmToken(registration);
    if (token) {
      updates.fcmToken = token;
    }

    // Limpa qualquer assinatura pendente cacheada pelo SW após pushsubscriptionchange
    if ('caches' in window) {
      caches
        .open('oa-notif-state')
        .then((c) => c.delete('/__pending-push-subscription'))
        .catch(() => {});
    }

    await savePushDataToPlayerDocs(userId, playerDocId, updates);
  } catch (err) {
    console.warn('Aviso ao sincronizar push subscription silenciosamente:', err);
  }
};

export const requestNotificationPermission = async (userId?: string, playerDocId?: string) => {
  if (!('Notification' in window)) {
    console.warn('⚠️ Notificações não suportadas neste navegador.');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission === 'denied') {
      alert(
        'As notificações foram bloqueadas. Para recebê-las no celular ou PC mesmo com o app fechado, toque no cadeado ou configurações do site no navegador e permita as notificações.'
      );
    }

    if (permission === 'granted') {
      playWhistleSound('double');

      if (userId) {
        const updates: Record<string, any> = {
          pushEnabled: true,
          pushSubscribedAt: new Date().toISOString(),
          lastPushSyncAt: new Date().toISOString(),
        };

        if ('serviceWorker' in navigator) {
          try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await ensureActivePushSubscription(registration);
            if (subscription) {
              const subJson = subscription.toJSON();
              updates.pushSubscription = subJson;
              try {
                if (subJson.endpoint) {
                  localStorage.setItem(MY_ENDPOINT_STORAGE_KEY, subJson.endpoint);
                }
              } catch {}
            }

            const token = await safeTryGetFcmToken(registration);
            if (token) {
              updates.fcmToken = token;
            }
          } catch (subErr) {
            console.warn('⚠️ Aviso ao registrar inscrição Web Push:', subErr);
          }
        }

        await savePushDataToPlayerDocs(userId, playerDocId, updates);
      }
    }
    return permission === 'granted';
  } catch (error) {
    console.error('❌ Erro ao solicitar permissão:', error);
    return false;
  }
};

export const setupForegroundNotifications = () => {
  if (messaging) {
    onMessage(messaging, (payload) => {
      if (payload.notification) {
        sendPushNotification(
          payload.notification.title || 'O&A',
          payload.notification.body || '',
          'single'
        );
      }
    });
  }
};

async function collectTargetRecipients(
  targetStatus: 'all' | 'pendente',
  excludeUserId?: string
): Promise<{ subscriptions: any[]; tokens: string[] }> {
  const subscriptions: any[] = [];
  const tokens: string[] = [];
  const seenEndpoints = new Set<string>();
  const seenTokens = new Set<string>();

  let myEndpoint = '';
  try {
    myEndpoint = localStorage.getItem(MY_ENDPOINT_STORAGE_KEY) || '';
  } catch {}

  try {
    const qPlayers = query(collection(db, 'players'), where('pushEnabled', '==', true));
    const playersSnap = await getDocs(qPlayers);
    playersSnap.forEach((docSnap) => {
      const p = docSnap.data();
      if (excludeUserId && (docSnap.id === excludeUserId || p.id === excludeUserId)) {
        return;
      }
      if (targetStatus === 'pendente') {
        const st = p.status || 'pendente';
        if (st !== 'pendente') return;
      }
      if (p.pushSubscription && p.pushSubscription.endpoint) {
        const ep = p.pushSubscription.endpoint;
        if (excludeUserId && myEndpoint && ep === myEndpoint) return;
        if (!seenEndpoints.has(ep)) {
          seenEndpoints.add(ep);
          subscriptions.push(p.pushSubscription);
        }
      }
      if (p.fcmToken && typeof p.fcmToken === 'string' && !seenTokens.has(p.fcmToken)) {
        seenTokens.add(p.fcmToken);
        tokens.push(p.fcmToken);
      }
    });
  } catch (qErr) {
    console.warn('Aviso ao buscar destinatários push:', qErr);
  }

  return { subscriptions, tokens };
}

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

    // 2. Salvar no Firestore (histórico + entrega em tempo real para telas abertas)
    const docRef = await addDoc(collection(db, 'notifications'), {
      title,
      body,
      createdAt: new Date().toISOString(),
      type: targetStatus === 'pendente' ? 'pending_reminder' : 'broadcast',
      targetStatus,
      soundPattern,
      senderId: senderId || auth.currentUser?.uid || null,
    });

    // 3. Buscar todas as inscrições W3C Web Push e tokens FCM para entrega com app FECHADO ou em SEGUNDO PLANO
    const { subscriptions, tokens } = await collectTargetRecipients(targetStatus);
    const headers = await getAuthHeaders();

    await fetch('/api/send-notification', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title,
        body,
        url: '/',
        targetStatus,
        soundPattern,
        tag: `oa-broadcast-${docRef.id}`,
        subscriptions,
        tokens,
      }),
    }).catch((err) => {
      console.warn('Aviso ao disparar Web Push no servidor:', err);
    });
  } catch (error) {
    console.error('❌ Erro ao transmitir notificação:', error);
  }
};

/**
 * Envia Push em segundo plano para mudanças de presença sem gerar duplicidade em telas abertas.
 */
export const sendBackgroundPushOnly = async (
  title: string,
  body: string,
  actorUid: string,
  soundPattern: WhistlePattern = 'single'
) => {
  try {
    const { subscriptions, tokens } = await collectTargetRecipients('all', actorUid);
    if (subscriptions.length === 0 && tokens.length === 0) return;

    const headers = await getAuthHeaders();
    await fetch('/api/send-notification', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title,
        body,
        url: '/',
        targetStatus: 'all',
        soundPattern,
        tag: `oa-presence-${actorUid.slice(0, 12)}-${Date.now()}`,
        suppressWhenOpen: true,
        subscriptions,
        tokens,
      }),
    }).catch(() => {});
  } catch {}
};

/**
 * Agenda um Web Push real no servidor com atraso para testar com o app minimizado ou fechado.
 */
export const testBackgroundPush = async (
  userId: string,
  playerDocId?: string,
  delaySeconds: number = 5
): Promise<{ ok: boolean; error?: string; warning?: string }> => {
  if (!('Notification' in window)) {
    return { ok: false, error: 'Seu navegador não suporta notificações push.' };
  }

  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermission(userId, playerDocId);
    if (!granted) {
      return { ok: false, error: 'Permissão de notificação não concedida.' };
    }
  } else {
    await syncPushSubscription(userId, playerDocId);
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await ensureActivePushSubscription(registration);
    if (!subscription) {
      return { ok: false, error: 'Não foi possível registrar a inscrição push neste aparelho.' };
    }

    const fcmToken = await safeTryGetFcmToken(registration);

    const headers = await getAuthHeaders();
    const res = await fetch('/api/send-notification', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: '🔔 PUSH EM SEGUNDO PLANO ATIVO!',
        body: 'Mesmo com o app minimizado ou fechado, os avisos da pelada O&A chegarão normalmente.',
        url: '/',
        soundPattern: 'double',
        tag: `oa-bg-test-${Date.now()}`,
        suppressWhenOpen: false,
        delayMs: Math.max(0, Math.min(8000, delaySeconds * 1000)),
        subscriptions: [subscription.toJSON()],
        tokens: fcmToken ? [fcmToken] : [],
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || 'Erro ao agendar push no servidor.' };
    }
    if (data.warning) {
      return { ok: false, error: data.warning, warning: data.warning };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Falha de conexão ao testar push em segundo plano.' };
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
  playWhistleSound(soundPattern);

  if (!('Notification' in window)) {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  try {
    const vibratePattern =
      soundPattern === 'triple'
        ? [200, 100, 200, 100, 450]
        : soundPattern === 'double'
          ? [200, 100, 250]
          : soundPattern === 'start'
            ? [500]
            : [200];

    const options = {
      body,
      icon: '/pwa-192x192.png?v=21',
      badge: '/pwa-192x192.png?v=21',
      vibrate: vibratePattern,
      tag: 'oa-notification-' + Date.now(),
      renotify: true,
      requireInteraction: true,
      data: { url: window.location.origin },
    };

    if ('serviceWorker' in navigator) {
      try {
        const swReadyPromise = navigator.serviceWorker.ready;
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000));
        const registration = await Promise.race([swReadyPromise, timeoutPromise]);

        if (registration && registration.showNotification) {
          await registration.showNotification(title, options as any);
          return;
        }
      } catch {}
    }

    const notif = new Notification(title, {
      body: options.body,
      icon: options.icon,
      tag: options.tag,
    });

    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch (error) {
    console.error('❌ Erro ao disparar notificação:', error);
  }
};

export const resetNotificationsRoutine = async (userId?: string) => {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== 'oa-shared-receipt-cache').map((key) => caches.delete(key))
      );
    }

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        if (registration.active) {
          registration.active.postMessage({ type: 'CLEAR_CACHE' });
          registration.active.postMessage({ type: 'RESET_NOTIFICATIONS' });
        }
        await registration.unregister();
      }

      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
    }

    if (userId) {
      await requestNotificationPermission(userId);
    }

    alert('Rotina de limpeza concluída! As notificações foram resetadas e o cache foi limpo.');
    return true;
  } catch (err) {
    console.error('❌ Erro na rotina de reset:', err);
    alert('Ocorreu um erro ao resetar as notificações. Tente recarregar a página.');
    return false;
  }
};
