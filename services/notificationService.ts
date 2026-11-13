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
import { VAPID_PUBLIC_KEY, isValidVapidPublicKey } from '../constants/vapid.ts';

const MY_ENDPOINT_STORAGE_KEY = 'oa_my_push_endpoint';
const FCM_SKIP_UNTIL_KEY = 'oa_fcm_skip_until';
const SYNC_FP_PREFIX = 'oa_push_sync_fp_';
const NOTIF_STATE_CACHE = 'oa-notif-state';
const ACTIVE_VAPID_KEY_CACHE_PATH = '/__active-vapid-public-key';
const PENDING_SUB_CACHE_PATH = '/__pending-push-subscription';

const syncCooldownByTarget = new Map<string, number>();
const inFlightSyncByTarget = new Map<string, Promise<void>>();
let cachedServerVapidKey: string | null = null;
let serverVapidKeyFetchedAt = 0;
let inFlightVapidFetch: Promise<string | null> | null = null;
let loggedKeyMismatchWarning = false;

const VAPID_KEY_TTL_MS = 5 * 60 * 1000;

async function persistVapidKeyForServiceWorker(key: string): Promise<void> {
  if (!isValidVapidPublicKey(key)) return;
  try {
    if ('caches' in window) {
      const cache = await caches.open(NOTIF_STATE_CACHE);
      await cache.put(
        ACTIVE_VAPID_KEY_CACHE_PATH,
        new Response(JSON.stringify({ vapidPublicKey: key, updatedAt: Date.now() }), {
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
  } catch {}
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      reg?.active?.postMessage({ type: 'SET_VAPID_PUBLIC_KEY', vapidPublicKey: key });
    }
  } catch {}
}

async function readVapidKeyFromCacheStorage(): Promise<string | null> {
  try {
    if (!('caches' in window)) return null;
    const cache = await caches.open(NOTIF_STATE_CACHE);
    const res = await cache.match(ACTIVE_VAPID_KEY_CACHE_PATH);
    if (!res) return null;
    const data = await res.json();
    if (data && isValidVapidPublicKey(data.vapidPublicKey)) {
      return String(data.vapidPublicKey).trim();
    }
  } catch {}
  return null;
}

export async function resolveVapidPublicKey(forceRefresh = false): Promise<string | null> {
  const now = Date.now();
  if (!forceRefresh && cachedServerVapidKey && now - serverVapidKeyFetchedAt < VAPID_KEY_TTL_MS) {
    return cachedServerVapidKey;
  }

  if (!inFlightVapidFetch) {
    inFlightVapidFetch = (async () => {
      const envPublicKey = isValidVapidPublicKey(VAPID_PUBLIC_KEY) ? VAPID_PUBLIC_KEY : '';
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && isValidVapidPublicKey(data.vapidPublicKey)) {
            const serverKey = String(data.vapidPublicKey).trim();
            if (envPublicKey && envPublicKey !== serverKey && !loggedKeyMismatchWarning) {
              loggedKeyMismatchWarning = true;
              console.warn(
                'Aviso: VITE_VAPID_PUBLIC_KEY difere de VAPID_PUBLIC_KEY em /api/health. Usando a chave ativa do servidor.'
              );
            }
            cachedServerVapidKey = serverKey;
            serverVapidKeyFetchedAt = Date.now();
            await persistVapidKeyForServiceWorker(serverKey);
            return serverKey;
          }
        }
      } catch {}

      if (envPublicKey) {
        cachedServerVapidKey = envPublicKey;
        serverVapidKeyFetchedAt = Date.now();
        await persistVapidKeyForServiceWorker(envPublicKey);
        return envPublicKey;
      }

      const cachedOfflineKey = await readVapidKeyFromCacheStorage();
      if (cachedOfflineKey) {
        cachedServerVapidKey = cachedOfflineKey;
        serverVapidKeyFetchedAt = Date.now();
        return cachedOfflineKey;
      }

      return null;
    })().finally(() => {
      inFlightVapidFetch = null;
    });
  }

  return inFlightVapidFetch;
}

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

async function safeTryGetFcmToken(
  registration: ServiceWorkerRegistration,
  activePublicKey: string
): Promise<string | null> {
  if (!shouldAttemptFcmToken() || !messaging || !isValidVapidPublicKey(activePublicKey)) return null;
  try {
    const token = await getToken(messaging, {
      vapidKey: activePublicKey,
      serviceWorkerRegistration: registration,
    });
    return token || null;
  } catch {
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

export function isSameApplicationServerKey(
  subscription: PushSubscription | { options?: { applicationServerKey?: ArrayBuffer | null } },
  vapidPublicKey: string
): boolean {
  try {
    if (!isValidVapidPublicKey(vapidPublicKey)) return false;
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

function isValidSerializedSubscription(sub: any): boolean {
  return Boolean(
    sub &&
      typeof sub === 'object' &&
      typeof sub.endpoint === 'string' &&
      sub.endpoint.startsWith('https://') &&
      sub.keys &&
      typeof sub.keys.p256dh === 'string' &&
      sub.keys.p256dh.length > 0 &&
      typeof sub.keys.auth === 'string' &&
      sub.keys.auth.length > 0
  );
}

async function readPendingPushSubscription(
  activePublicKey: string
): Promise<{ subscription: PushSubscriptionJSON; updatedAt: number } | null> {
  try {
    if (!('caches' in window)) return null;
    const cache = await caches.open(NOTIF_STATE_CACHE);
    const res = await cache.match(PENDING_SUB_CACHE_PATH);
    if (!res) return null;
    const data = await res.json();
    if (!data || !isValidSerializedSubscription(data.subscription)) return null;
    if (data.vapidPublicKey && data.vapidPublicKey !== activePublicKey) return null;
    return { subscription: data.subscription, updatedAt: Number(data.updatedAt) || Date.now() };
  } catch {
    return null;
  }
}

async function clearPendingPushSubscription(): Promise<void> {
  try {
    if (!('caches' in window)) return;
    const cache = await caches.open(NOTIF_STATE_CACHE);
    await cache.delete(PENDING_SUB_CACHE_PATH);
  } catch {}
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
  registration: ServiceWorkerRegistration,
  activePublicKey: string,
  forceRenew = false
): Promise<PushSubscription | null> {
  if (!isValidVapidPublicKey(activePublicKey)) return null;

  let subscription = await registration.pushManager.getSubscription();
  if (subscription && (forceRenew || !isSameApplicationServerKey(subscription, activePublicKey))) {
    try {
      await subscription.unsubscribe();
    } catch {}
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(activePublicKey),
    });
  }
  return subscription;
}

async function savePushDataToPlayerDocs(
  userId: string,
  playerDocId: string | undefined,
  payload: Record<string, any>
): Promise<void> {
  const primaryId = playerDocId || userId;
  await setDoc(doc(db, 'players', primaryId), payload, { merge: true }).catch(() =>
    updateDoc(doc(db, 'players', primaryId), payload)
  );

  if (playerDocId && playerDocId !== userId) {
    await updateDoc(doc(db, 'players', userId), payload).catch(() => {});
  }
}

function clearSyncFingerprintsForUser(userId: string, playerDocId?: string) {
  try {
    localStorage.removeItem(`${SYNC_FP_PREFIX}${userId}`);
    if (playerDocId) {
      localStorage.removeItem(`${SYNC_FP_PREFIX}${playerDocId}`);
    }
  } catch {}
}

export const getNotificationStatus = () => {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
};

/**
 * Garante que o atleta autenticado com permissão ativa tenha a inscrição W3C Web Push
 * (com chave VAPID atual validada) vinculada ao documento correto no Firestore sem gravações repetidas.
 */
export const syncPushSubscription = async (
  userId: string,
  playerDocId?: string,
  options?: { force?: boolean }
): Promise<void> => {
  if (!userId || typeof window === 'undefined') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  const targetKey = `${userId}::${playerDocId || ''}`;
  const existingPromise = inFlightSyncByTarget.get(targetKey);
  if (existingPromise) {
    return existingPromise;
  }

  const now = Date.now();
  const lastAttempt = syncCooldownByTarget.get(targetKey) || 0;
  if (!options?.force && now - lastAttempt < 8000) return;
  syncCooldownByTarget.set(targetKey, now);

  const runSync = (async () => {
    try {
      const activePublicKey = await resolveVapidPublicKey(Boolean(options?.force));
      if (!activePublicKey) {
        console.warn('VAPID_PUBLIC_KEY/VITE_VAPID_PUBLIC_KEY ausente; sincronização push aguardando configuração do servidor.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const pendingData = await readPendingPushSubscription(activePublicKey);
      const subscription = await ensureActivePushSubscription(
        registration,
        activePublicKey,
        Boolean(options?.force)
      );

      let subJson: PushSubscriptionJSON | null = null;
      if (subscription) {
        subJson = subscription.toJSON();
      } else if (pendingData) {
        subJson = pendingData.subscription;
      }

      if (!subJson || !isValidSerializedSubscription(subJson)) {
        return;
      }

      const token = await safeTryGetFcmToken(registration, activePublicKey);
      const primaryId = playerDocId || userId;
      const fpKey = `${SYNC_FP_PREFIX}${primaryId}`;
      const fingerprint = JSON.stringify({
        primaryId,
        userId,
        endpoint: subJson.endpoint || '',
        p256dh: subJson.keys?.p256dh || '',
        auth: subJson.keys?.auth || '',
        fcmToken: token || '',
        vapidPublicKey: activePublicKey,
        pushEnabled: true,
      });

      let prevFingerprint = '';
      try {
        prevFingerprint = localStorage.getItem(fpKey) || '';
      } catch {}

      if (!options?.force && !pendingData && prevFingerprint === fingerprint) {
        try {
          if (subJson.endpoint) {
            localStorage.setItem(MY_ENDPOINT_STORAGE_KEY, subJson.endpoint);
          }
        } catch {}
        return;
      }

      const updates: Record<string, any> = {
        pushEnabled: true,
        pushSubscription: subJson,
        lastPushSyncAt: new Date().toISOString(),
      };
      if (token) {
        updates.fcmToken = token;
      }

      await savePushDataToPlayerDocs(userId, playerDocId, updates);

      try {
        localStorage.setItem(fpKey, fingerprint);
        if (subJson.endpoint) {
          localStorage.setItem(MY_ENDPOINT_STORAGE_KEY, subJson.endpoint);
        }
      } catch {}

      if (pendingData) {
        await clearPendingPushSubscription();
      }
    } catch (err) {
      console.warn('Aviso ao sincronizar push subscription silenciosamente:', err);
    } finally {
      inFlightSyncByTarget.delete(targetKey);
    }
  })();

  inFlightSyncByTarget.set(targetKey, runSync);
  return runSync;
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
        const activePublicKey = await resolveVapidPublicKey(true);
        const updates: Record<string, any> = {
          pushEnabled: true,
          pushSubscribedAt: new Date().toISOString(),
          lastPushSyncAt: new Date().toISOString(),
        };

        let subJson: PushSubscriptionJSON | null = null;
        let token: string | null = null;

        if ('serviceWorker' in navigator && activePublicKey) {
          try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await ensureActivePushSubscription(registration, activePublicKey);
            if (subscription) {
              subJson = subscription.toJSON();
              updates.pushSubscription = subJson;
            }

            token = await safeTryGetFcmToken(registration, activePublicKey);
            if (token) {
              updates.fcmToken = token;
            }
          } catch (subErr) {
            console.warn('⚠️ Aviso ao registrar inscrição Web Push:', subErr);
          }
        }

        await savePushDataToPlayerDocs(userId, playerDocId, updates);

        if (subJson && activePublicKey) {
          const primaryId = playerDocId || userId;
          try {
            if (subJson.endpoint) {
              localStorage.setItem(MY_ENDPOINT_STORAGE_KEY, subJson.endpoint);
            }
            localStorage.setItem(
              `${SYNC_FP_PREFIX}${primaryId}`,
              JSON.stringify({
                primaryId,
                userId,
                endpoint: subJson.endpoint || '',
                p256dh: subJson.keys?.p256dh || '',
                auth: subJson.keys?.auth || '',
                fcmToken: token || '',
                vapidPublicKey: activePublicKey,
                pushEnabled: true,
              })
            );
          } catch {}
        }
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

async function postNotificationPayload(
  payload: Record<string, any>,
  contextUser?: { userId?: string; playerDocId?: string }
): Promise<{ status: number; ok: boolean; data: any }> {
  const headers = await getAuthHeaders();
  const bodyStr = JSON.stringify(payload);
  const res = await fetch('/api/send-notification', {
    method: 'POST',
    headers,
    body: bodyStr,
    ...(bodyStr.length < 60000 ? { keepalive: true } : {}),
  });

  const data = await res.json().catch(() => ({}));

  // Somente 410/404 retornados em expiredEndpoints disparam renovação da assinatura local.
  // Erros 401/403 (auth ou VAPID mismatch) NÃO removem nem desinscrevem assinaturas existentes.
  if (res.ok && Array.isArray(data.expiredEndpoints) && data.expiredEndpoints.length > 0) {
    let myEndpoint = '';
    try {
      myEndpoint = localStorage.getItem(MY_ENDPOINT_STORAGE_KEY) || '';
    } catch {}
    const uid = contextUser?.userId || auth.currentUser?.uid;
    if (myEndpoint && data.expiredEndpoints.includes(myEndpoint) && uid) {
      clearSyncFingerprintsForUser(uid, contextUser?.playerDocId);
      syncPushSubscription(uid, contextUser?.playerDocId, { force: true }).catch(() => {});
    }
  }

  return { status: res.status, ok: res.ok, data };
}

export const broadcastNotification = async (
  title: string,
  body: string,
  senderId?: string,
  targetStatus: 'all' | 'pendente' = 'all',
  soundPattern: WhistlePattern = 'single'
) => {
  try {
    playWhistleSound(soundPattern);

    const docRef = await addDoc(collection(db, 'notifications'), {
      title,
      body,
      createdAt: new Date().toISOString(),
      type: targetStatus === 'pendente' ? 'pending_reminder' : 'broadcast',
      targetStatus,
      soundPattern,
      senderId: senderId || auth.currentUser?.uid || null,
    });

    const { subscriptions, tokens } = await collectTargetRecipients(targetStatus);
    await postNotificationPayload({
      title,
      body,
      url: '/',
      targetStatus,
      soundPattern,
      tag: `oa-broadcast-${docRef.id}`,
      subscriptions,
      tokens,
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

    await postNotificationPayload(
      {
        title,
        body,
        url: '/',
        targetStatus: 'all',
        soundPattern,
        tag: `oa-presence-${actorUid.slice(0, 12)}-${Date.now()}`,
        suppressWhenOpen: true,
        subscriptions,
        tokens,
      },
      { userId: actorUid }
    ).catch(() => {});
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
    const activePublicKey = await resolveVapidPublicKey(true);
    if (!activePublicKey) {
      return {
        ok: false,
        error: 'Chave pública VAPID não configurada no servidor (/api/health).',
      };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await ensureActivePushSubscription(registration, activePublicKey);
    if (!subscription) {
      return { ok: false, error: 'Não foi possível registrar a inscrição push neste aparelho.' };
    }

    const fcmToken = await safeTryGetFcmToken(registration, activePublicKey);

    const { status, ok, data } = await postNotificationPayload(
      {
        title: '🔔 PUSH EM SEGUNDO PLANO ATIVO!',
        body: 'Mesmo com o app minimizado ou fechado, os avisos da pelada O&A chegarão normalmente.',
        url: '/',
        soundPattern: 'double',
        tag: `oa-bg-test-${Date.now()}`,
        suppressWhenOpen: false,
        delayMs: Math.max(0, Math.min(8000, delaySeconds * 1000)),
        subscriptions: [subscription.toJSON()],
        tokens: fcmToken ? [fcmToken] : [],
      },
      { userId, playerDocId }
    );

    if (!ok) {
      if (status === 401 || status === 403) {
        return {
          ok: false,
          error: data.error || 'Sessão expirada na autenticação da API. Recarregue o aplicativo e tente novamente.',
        };
      }
      return { ok: false, error: data.error || 'Erro ao agendar push no servidor.' };
    }

    if (Array.isArray(data.expiredEndpoints) && data.expiredEndpoints.length > 0 && data.sentCount === 0) {
      return {
        ok: false,
        error: 'Inscrição push expirada (410/404) foi renovada automaticamente. Toque novamente para testar.',
      };
    }

    if (data.warning) {
      return { ok: false, error: data.warning, warning: data.warning };
    }

    if (Number(data.vapidErrorCount) > 0 && Number(data.sentCount) === 0) {
      return {
        ok: false,
        error: 'Falha VAPID (401/403) no serviço de push. Confira se VAPID_PUBLIC_KEY, VITE_VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY pertencem ao mesmo par.',
      };
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
      icon: '/pwa-192x192.png?v=20',
      badge: '/pwa-192x192.png?v=20',
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
      clearSyncFingerprintsForUser(userId);
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
