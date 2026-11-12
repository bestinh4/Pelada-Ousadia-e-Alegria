import webpush from 'web-push';
import admin from 'firebase-admin';

const DEFAULT_VAPID_PUBLIC_KEY =
  'BIXN8KDG-7IS82_ykSdcgndt1wyVaWnz0Y5TLBAPWSJRhbPXV5sHpN2TxxhwA3ZwdOUbVPjhYxFmenwVciZN2xE';
const VAPID_SUBJECT = 'mailto:diiogo49@gmail.com';

let configuredVapidPair = null;

function cleanEnvValue(raw) {
  return (raw || '').trim().replace(/^["']|["']$/g, '');
}

export function getServerVapidPublicKey() {
  return (
    cleanEnvValue(process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY) ||
    DEFAULT_VAPID_PUBLIC_KEY
  );
}

function ensureWebPushConfigured() {
  const privateKey = cleanEnvValue(process.env.VAPID_PRIVATE_KEY);
  const publicKey = getServerVapidPublicKey();
  if (!privateKey) {
    return {
      ready: false,
      error: 'VAPID_PRIVATE_KEY não configurada nas variáveis de ambiente do servidor.',
    };
  }
  const pairKey = `${publicKey}:${privateKey}`;
  if (configuredVapidPair === pairKey) {
    return { ready: true };
  }

  try {
    webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
    configuredVapidPair = pairKey;
    return { ready: true };
  } catch (err) {
    console.warn('Aviso ao configurar VAPID:', err?.message || err);
    return { ready: false, error: 'VAPID_PRIVATE_KEY inválida no servidor.' };
  }
}

export function isWebPushConfigured() {
  return ensureWebPushConfigured().ready;
}

function ensureFirebaseAdmin() {
  try {
    if (admin.apps.length > 0) return true;
    const rawSa = cleanEnvValue(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!rawSa) return false;

    const serviceAccount = JSON.parse(rawSa);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'ousadia-5b1d8',
    });
    return true;
  } catch (err) {
    console.warn('Aviso ao inicializar Firebase Admin em _push:', err?.message || err);
    return false;
  }
}

export function sanitizePushPayload(input) {
  const rawTitle = typeof input?.title === 'string' ? input.title.trim() : '';
  const rawBody = typeof input?.body === 'string' ? input.body.trim() : '';
  const safeTitle = (rawTitle || 'Ousadia & Alegria').slice(0, 150);
  const safeBody = (rawBody || 'Atualizações na pelada!').slice(0, 300);
  const safeUrl =
    typeof input?.url === 'string' && (input.url.startsWith('/') || input.url.startsWith('https://'))
      ? input.url.slice(0, 200)
      : '/';
  const safeSound =
    input?.soundPattern === 'double' || input?.soundPattern === 'triple' || input?.soundPattern === 'start'
      ? input.soundPattern
      : 'single';
  const safeTargetStatus = input?.targetStatus === 'pendente' ? 'pendente' : 'all';
  const rawTag = typeof input?.tag === 'string' ? input.tag.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) : '';
  const safeTag = rawTag || `oa-notif-${Date.now()}`;
  const suppressWhenOpen = Boolean(input?.suppressWhenOpen);
  const parsedDelay = Number(input?.delayMs) || 0;
  const safeDelayMs = Math.max(0, Math.min(8000, parsedDelay));

  return {
    safeTitle,
    safeBody,
    safeUrl,
    safeSound,
    safeTargetStatus,
    safeTag,
    suppressWhenOpen,
    safeDelayMs,
  };
}

export function isValidPushSubscription(sub) {
  return Boolean(
    sub &&
      typeof sub === 'object' &&
      typeof sub.endpoint === 'string' &&
      sub.endpoint.startsWith('https://') &&
      sub.endpoint.length <= 2048 &&
      sub.keys &&
      typeof sub.keys === 'object' &&
      typeof sub.keys.p256dh === 'string' &&
      sub.keys.p256dh.length > 0 &&
      typeof sub.keys.auth === 'string' &&
      sub.keys.auth.length > 0
  );
}

export async function sendDualChannelPush(input) {
  const {
    safeTitle,
    safeBody,
    safeUrl,
    safeSound,
    safeTargetStatus,
    safeTag,
    suppressWhenOpen,
    safeDelayMs,
  } = sanitizePushPayload(input);

  if (safeDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, safeDelayMs));
  }

  const uniqueSubsMap = new Map();
  if (Array.isArray(input?.subscriptions)) {
    for (const sub of input.subscriptions.slice(0, 250)) {
      if (isValidPushSubscription(sub)) {
        uniqueSubsMap.set(sub.endpoint, sub);
      }
    }
  }

  const uniqueTokens = new Set();
  if (Array.isArray(input?.tokens)) {
    for (const token of input.tokens.slice(0, 500)) {
      if (typeof token === 'string' && token.trim().length > 10) {
        uniqueTokens.add(token.trim());
      }
    }
  }

  const hasAdminCreds = ensureFirebaseAdmin();
  if (hasAdminCreds && uniqueSubsMap.size === 0 && uniqueTokens.size === 0) {
    try {
      const db = admin.firestore();
      const playersSnap = await db.collection('players').where('pushEnabled', '==', true).get();
      playersSnap.forEach((pDoc) => {
        const pData = pDoc.data();
        if (safeTargetStatus === 'pendente') {
          const st = pData.status || 'pendente';
          if (st !== 'pendente') return;
        }
        if (isValidPushSubscription(pData.pushSubscription)) {
          uniqueSubsMap.set(pData.pushSubscription.endpoint, pData.pushSubscription);
        }
        if (pData.fcmToken && typeof pData.fcmToken === 'string' && pData.fcmToken.trim().length > 10) {
          uniqueTokens.add(pData.fcmToken.trim());
        }
      });
    } catch (dbErr) {
      console.warn('Aviso ao consultar inscritos no Firestore Admin:', dbErr);
    }
  }

  const webPushCheck = ensureWebPushConfigured();
  let sentCount = 0;
  let failedCount = 0;
  let fcmSentCount = 0;
  let fcmFailedCount = 0;
  const expiredEndpoints = [];

  const jsonPayload = JSON.stringify({
    title: safeTitle,
    body: safeBody,
    url: safeUrl,
    soundPattern: safeSound,
    tag: safeTag,
    suppressWhenOpen,
    sentAt: Date.now(),
  });

  if (webPushCheck.ready && uniqueSubsMap.size > 0) {
    const subs = Array.from(uniqueSubsMap.values());
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, jsonPayload, {
            TTL: 60 * 60 * 24,
            urgency: 'high',
            topic: safeTag.slice(0, 32),
          });
          sentCount++;
        } catch (pushErr) {
          failedCount++;
          if (pushErr?.statusCode === 410 || pushErr?.statusCode === 404) {
            expiredEndpoints.push(sub.endpoint);
          }
        }
      })
    );
  }

  if (hasAdminCreds && uniqueTokens.size > 0) {
    try {
      const fcmTokens = Array.from(uniqueTokens).slice(0, 500);
      const message = {
        data: {
          title: safeTitle,
          body: safeBody,
          url: safeUrl,
          soundPattern: safeSound,
          tag: safeTag,
          suppressWhenOpen: suppressWhenOpen ? 'true' : 'false',
        },
        webpush: {
          headers: {
            Urgency: 'high',
            TTL: '86400',
          },
          notification: suppressWhenOpen
            ? undefined
            : {
                title: safeTitle,
                body: safeBody,
                icon: '/pwa-192x192.png?v=21',
                badge: '/pwa-192x192.png?v=21',
                tag: safeTag,
                renotify: true,
                requireInteraction: true,
              },
        },
        tokens: fcmTokens,
      };

      const result = await admin.messaging().sendEachForMulticast(message);
      fcmSentCount = result.successCount;
      fcmFailedCount = result.failureCount;
    } catch (fcmErr) {
      console.warn('Aviso ao enviar multicast FCM:', fcmErr);
    }
  }

  let warning;
  if (!webPushCheck.ready && uniqueSubsMap.size > 0) {
    warning = webPushCheck.error;
  }

  return {
    ok: webPushCheck.ready || hasAdminCreds,
    sentCount,
    failedCount,
    fcmSentCount,
    fcmFailedCount,
    expiredEndpoints,
    title: safeTitle,
    warning,
  };
}
