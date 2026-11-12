import webpush from 'web-push';
import admin from 'firebase-admin';
import { VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '../constants/vapid.ts';

export interface PushRequestInput {
  title?: unknown;
  body?: unknown;
  url?: unknown;
  soundPattern?: unknown;
  targetStatus?: unknown;
  tag?: unknown;
  suppressWhenOpen?: unknown;
  subscriptions?: unknown;
  tokens?: unknown;
  delayMs?: unknown;
}

export interface PushDispatchResult {
  ok: boolean;
  sentCount: number;
  failedCount: number;
  fcmSentCount: number;
  fcmFailedCount: number;
  expiredEndpoints: string[];
  title: string;
  warning?: string;
}

let configuredVapidKey: string | null = null;

function ensureWebPushConfigured(): boolean {
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (!privateKey) return false;
  if (configuredVapidKey === privateKey) return true;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, privateKey);
  configuredVapidKey = privateKey;
  return true;
}

function ensureFirebaseAdmin(): boolean {
  if (admin.apps.length > 0) return true;
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return false;

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'ousadia-5b1d8',
  });
  return true;
}

export function sanitizePushPayload(input: PushRequestInput) {
  const rawTitle = typeof input.title === 'string' ? input.title.trim() : '';
  const rawBody = typeof input.body === 'string' ? input.body.trim() : '';
  const safeTitle = (rawTitle || 'Ousadia & Alegria').slice(0, 150);
  const safeBody = (rawBody || 'Atualizações na pelada!').slice(0, 300);
  const safeUrl =
    typeof input.url === 'string' && (input.url.startsWith('/') || input.url.startsWith('https://'))
      ? input.url.slice(0, 200)
      : '/';
  const safeSound =
    input.soundPattern === 'double' || input.soundPattern === 'triple' || input.soundPattern === 'start'
      ? input.soundPattern
      : 'single';
  const safeTargetStatus = input.targetStatus === 'pendente' ? 'pendente' : 'all';
  const rawTag = typeof input.tag === 'string' ? input.tag.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) : '';
  const safeTag = rawTag || `oa-notif-${Date.now()}`;
  const suppressWhenOpen = Boolean(input.suppressWhenOpen);
  const parsedDelay = Number(input.delayMs) || 0;
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

export function isValidPushSubscription(sub: any): sub is webpush.PushSubscription {
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

export async function sendDualChannelPush(input: PushRequestInput): Promise<PushDispatchResult> {
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

  const uniqueSubsMap = new Map<string, webpush.PushSubscription>();
  if (Array.isArray(input.subscriptions)) {
    for (const sub of input.subscriptions.slice(0, 250)) {
      if (isValidPushSubscription(sub)) {
        uniqueSubsMap.set(sub.endpoint, sub);
      }
    }
  }

  const uniqueTokens = new Set<string>();
  if (Array.isArray(input.tokens)) {
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

  const webPushReady = ensureWebPushConfigured();
  let sentCount = 0;
  let failedCount = 0;
  let fcmSentCount = 0;
  let fcmFailedCount = 0;
  const expiredEndpoints: string[] = [];

  const jsonPayload = JSON.stringify({
    title: safeTitle,
    body: safeBody,
    url: safeUrl,
    soundPattern: safeSound,
    tag: safeTag,
    suppressWhenOpen,
    sentAt: Date.now(),
  });

  if (webPushReady && uniqueSubsMap.size > 0) {
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
        } catch (pushErr: any) {
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

      const result = await admin.messaging().sendEachForMulticast(message as any);
      fcmSentCount = result.successCount;
      fcmFailedCount = result.failureCount;
    } catch (fcmErr) {
      console.warn('Aviso ao enviar multicast FCM:', fcmErr);
    }
  }

  let warning: string | undefined;
  if (!webPushReady && uniqueSubsMap.size > 0) {
    warning = 'VAPID_PRIVATE_KEY não configurada no servidor.';
  }

  return {
    ok: webPushReady || hasAdminCreds,
    sentCount,
    failedCount,
    fcmSentCount,
    fcmFailedCount,
    expiredEndpoints,
    title: safeTitle,
    warning,
  };
}
