// Service Worker Oficial — Ousadia & Alegria (Background Push W3C + PWA Offline + Keep-Alive)
const ICON_VERSION = 'v20';
const ICON_URL = `/pwa-192x192.png?${ICON_VERSION}`;
const CACHE_NAME = 'oa-elite-pro-v21';
const NOTIF_STATE_CACHE = 'oa-notif-state';
const ACTIVE_VAPID_KEY_CACHE_PATH = '/__active-vapid-public-key';
const PENDING_SUB_CACHE_PATH = '/__pending-push-subscription';
const PROTECTED_CACHES = new Set([CACHE_NAME, 'oa-shared-receipt-cache', NOTIF_STATE_CACHE]);
const APP_SHELL_ASSETS = ['/', '/manifest.json?v=20', ICON_URL, '/images/ousadia_alegria_crest.png?v=20'];

// Deduplicação em memória para evitar notificações duplicadas
const recentNotifTags = new Map();

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isValidVapidPublicKey(key) {
  if (!key || typeof key !== 'string') return false;
  try {
    const bytes = urlBase64ToUint8Array(key.trim());
    return bytes.length === 65 && bytes[0] === 0x04;
  } catch {
    return false;
  }
}

function isDuplicateTag(tag) {
  if (!tag) return false;
  const now = Date.now();
  for (const [key, ts] of recentNotifTags.entries()) {
    if (now - ts > 15000) recentNotifTags.delete(key);
  }
  if (recentNotifTags.has(tag)) return true;
  recentNotifTags.set(tag, now);
  return false;
}

async function saveActiveVapidPublicKey(key) {
  if (!isValidVapidPublicKey(key)) return;
  try {
    const cache = await caches.open(NOTIF_STATE_CACHE);
    await cache.put(
      ACTIVE_VAPID_KEY_CACHE_PATH,
      new Response(JSON.stringify({ vapidPublicKey: key.trim(), updatedAt: Date.now() }), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch {}
}

async function getActiveVapidPublicKey() {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && isValidVapidPublicKey(data.vapidPublicKey)) {
        const cleanKey = data.vapidPublicKey.trim();
        await saveActiveVapidPublicKey(cleanKey);
        return cleanKey;
      }
    }
  } catch {}

  try {
    const cache = await caches.open(NOTIF_STATE_CACHE);
    const cachedRes = await cache.match(ACTIVE_VAPID_KEY_CACHE_PATH);
    if (cachedRes) {
      const cachedData = await cachedRes.json();
      if (cachedData && isValidVapidPublicKey(cachedData.vapidPublicKey)) {
        return cachedData.vapidPublicKey.trim();
      }
    }
  } catch {}

  return null;
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(APP_SHELL_ASSETS.map((asset) => cache.add(asset))))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => !PROTECTED_CACHES.has(cacheName))
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Garantir atualização de ícones, compartilhamento de comprovante Pix e fallback offline
self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);

    // Captura comprovante compartilhado direto do app do banco para o app da pelada (Web Share Target)
    if (event.request.method === 'POST' && url.searchParams.has('share-receipt')) {
      event.respondWith(
        (async () => {
          try {
            const formData = await event.request.formData();
            const receiptFile = formData.get('receipt');
            if (receiptFile && typeof receiptFile === 'object') {
              const cache = await caches.open('oa-shared-receipt-cache');
              const headers = new Headers({
                'Content-Type': receiptFile.type || 'image/jpeg',
                'X-Receipt-Name': encodeURIComponent(receiptFile.name || 'comprovante.jpg'),
              });
              await cache.put('/__shared-receipt-file', new Response(receiptFile, { headers }));
            }
          } catch (err) {
            console.warn('Erro ao processar comprovante compartilhado no SW:', err);
          }
          return Response.redirect('/?shared-receipt=1', 303);
        })()
      );
      return;
    }

    if (
      url.pathname.includes('manifest.json') ||
      url.pathname.includes('pwa-') ||
      url.pathname.includes('apple-touch-icon') ||
      url.pathname.includes('favicon') ||
      url.pathname.includes('ousadia_alegria_crest')
    ) {
      event.respondWith(
        fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request))
      );
      return;
    }

    if (event.request.mode === 'navigate' && event.request.method === 'GET') {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put('/', copy)).catch(() => {});
            }
            return response;
          })
          .catch(() => caches.match('/') || caches.match(event.request))
      );
    }
  } catch (e) {}
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (!type) return;

  if (type === 'SET_VAPID_PUBLIC_KEY') {
    const incomingKey = event.data?.vapidPublicKey;
    if (isValidVapidPublicKey(incomingKey)) {
      event.waitUntil(saveActiveVapidPublicKey(incomingKey));
    }
    return;
  }

  if (type === 'PING' || type === 'KEEP_ALIVE_PING') {
    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage({
        type: type === 'PING' ? 'PONG' : 'KEEP_ALIVE_ACK',
        timestamp: Date.now(),
      });
    }
    return;
  }

  if (type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches
        .keys()
        .then((cacheNames) =>
          Promise.all(
            cacheNames
              .filter((name) => name !== 'oa-shared-receipt-cache')
              .map((name) => caches.delete(name))
          )
        )
        .then(() => {
          if (event.source && typeof event.source.postMessage === 'function') {
            event.source.postMessage({ type: 'CACHE_CLEARED' });
          }
        })
    );
    return;
  }

  if (type === 'RESET_NOTIFICATIONS' || type === 'CLEAR_BADGE') {
    event.waitUntil(
      Promise.allSettled([
        self.registration.clearAppBadge ? self.registration.clearAppBadge() : Promise.resolve(),
        type === 'RESET_NOTIFICATIONS'
          ? self.registration.getNotifications().then((notifications) => {
              notifications.forEach((n) => n.close());
            })
          : Promise.resolve(),
      ])
    );
  }
});

// Processa eventos Web Push padrão W3C e payloads FCM sem bloquear o boot em background com importScripts externos
self.addEventListener('push', (event) => {
  let data = {
    title: 'Ousadia & Alegria',
    body: 'Novidades na Pelada!',
    url: '/',
    soundPattern: 'single',
    tag: 'oa-notification-' + Date.now(),
    suppressWhenOpen: false,
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = {
        title: payload.notification?.title || payload.title || payload.data?.title || data.title,
        body: payload.notification?.body || payload.body || payload.data?.body || data.body,
        url: payload.data?.url || payload.url || '/',
        soundPattern: payload.soundPattern || payload.data?.soundPattern || 'single',
        tag: payload.tag || payload.data?.tag || 'oa-notification-' + Date.now(),
        suppressWhenOpen: Boolean(payload.suppressWhenOpen || payload.data?.suppressWhenOpen === 'true'),
      };
    }
  } catch {
    data.body = event.data ? event.data.text() : data.body;
  }

  if (isDuplicateTag(data.tag)) {
    return;
  }

  const soundPattern = data.soundPattern || 'single';
  const vibratePattern =
    soundPattern === 'triple'
      ? [200, 100, 200, 100, 450]
      : soundPattern === 'double'
        ? [200, 100, 250]
        : soundPattern === 'start'
          ? [500]
          : [200, 100, 200];

  const options = {
    body: data.body,
    icon: ICON_URL,
    badge: ICON_URL,
    vibrate: vibratePattern,
    tag: data.tag,
    renotify: true,
    requireInteraction: true,
    timestamp: Date.now(),
    data: {
      url: data.url || '/',
      soundPattern: data.soundPattern,
    },
  };

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const hasFocusedClient = windowClients.some(
        (c) => c.focused || c.visibilityState === 'visible'
      );

      // Para avisos automáticos de presença, evita popup duplicado se o usuário já estiver olhando a tela aberta
      if (data.suppressWhenOpen && hasFocusedClient) {
        return;
      }

      // Notifica abas minimizadas/abertas para tocar o apito se possível
      windowClients.forEach((client) => {
        try {
          client.postMessage({
            type: 'PUSH_RECEIVED',
            soundPattern: data.soundPattern,
            title: data.title,
            body: data.body,
          });
        } catch {}
      });

      if (typeof self.registration.setAppBadge === 'function') {
        self.registration.setAppBadge(1).catch(() => {});
      }

      await self.registration.showNotification(data.title, options);
    })()
  );
});

// Renovação automática da inscrição Push em segundo plano quando o navegador rotacionar as chaves/endpoint
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const activePublicKey = await getActiveVapidPublicKey();
        if (!activePublicKey) {
          console.warn('Chave VAPID pública indisponível durante pushsubscriptionchange.');
          return;
        }

        const newSubscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(activePublicKey),
        });

        const subJson = newSubscription.toJSON();
        const cache = await caches.open(NOTIF_STATE_CACHE);
        await cache.put(
          PENDING_SUB_CACHE_PATH,
          new Response(
            JSON.stringify({
              subscription: subJson,
              vapidPublicKey: activePublicKey,
              updatedAt: Date.now(),
            }),
            { headers: { 'Content-Type': 'application/json' } }
          )
        );

        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        clients.forEach((client) => {
          try {
            client.postMessage({ type: 'PUSH_SUBSCRIPTION_UPDATED', subscription: subJson });
          } catch {}
        });
      } catch (err) {
        console.warn('Falha ao renovar inscrição Web Push em background:', err);
      }
    })()
  );
});

// Sincronização periódica em segundo plano (quando suportado pelo navegador/Android)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'oa-notif-sync') {
    event.waitUntil(
      (async () => {
        try {
          const existing = await self.registration.pushManager.getSubscription();
          if (!existing) {
            const activePublicKey = await getActiveVapidPublicKey();
            if (activePublicKey) {
              const created = await self.registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(activePublicKey),
              });
              const cache = await caches.open(NOTIF_STATE_CACHE);
              await cache.put(
                PENDING_SUB_CACHE_PATH,
                new Response(
                  JSON.stringify({
                    subscription: created.toJSON(),
                    vapidPublicKey: activePublicKey,
                    updatedAt: Date.now(),
                  }),
                  { headers: { 'Content-Type': 'application/json' } }
                )
              );
            }
          }
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach((c) => c.postMessage({ type: 'SYNC_PUSH_SUBSCRIPTION' }));
        } catch {}
      })()
    );
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'oa-bg-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type: 'SYNC_PUSH_SUBSCRIPTION' }));
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      if (typeof self.registration.clearAppBadge === 'function') {
        self.registration.clearAppBadge().catch(() => {});
      }

      const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ('focus' in client) {
          await client.focus();
          if (urlToOpen && client.url !== urlToOpen && 'navigate' in client) {
            return client.navigate(urlToOpen).catch(() => client);
          }
          return client;
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })()
  );
});
