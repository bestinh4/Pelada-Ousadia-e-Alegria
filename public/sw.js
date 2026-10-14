// Importar scripts do Firebase para suporte nativo a FCM em background
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBa8kF4pSrx_-GuHVT_hGMgh_UmRc0NBx0",
  authDomain: "ousadia-5b1d8.firebaseapp.com",
  projectId: "ousadia-5b1d8",
  storageBucket: "ousadia-5b1d8.firebasestorage.app",
  messagingSenderId: "812821310641",
  appId: "1:812821310641:web:d5256ab8fea0ad1323c690"
});

const messaging = firebase.messaging();

console.log("🛠️ Service Worker carregado!");

const CACHE_NAME = 'oa-elite-pro-v20';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => self.clients.claim())
  );
});

// Garantir que ícones, escudo e manifest nunca fiquem presos em cache antigo + Receber Comprovante Compartilhado (Web Share Target)
self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);

    // Captura comprovante compartilhado direto do app do banco para o app da pelada
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
                'X-Receipt-Name': encodeURIComponent(receiptFile.name || 'comprovante.jpg')
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
        fetch(event.request, { cache: 'no-store' }).catch(() => fetch(event.request))
      );
    }
  } catch (e) {}
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PING') {
    event.source.postMessage({ type: 'PONG' });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log("🗑️ SW: Limpando todos os caches por solicitação...");
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      }).then(() => {
        console.log("✅ SW: Caches limpos!");
        if (event.source) event.source.postMessage({ type: 'CACHE_CLEARED' });
      })
    );
  }

  if (event.data && event.data.type === 'RESET_NOTIFICATIONS') {
    console.log("🔄 SW: Resetando notificações ativas...");
    event.waitUntil(
      self.registration.getNotifications().then((notifications) => {
        notifications.forEach(notification => notification.close());
        console.log("✅ SW: Notificações fechadas!");
      })
    );
  }
});

self.addEventListener('push', (event) => {
  console.log("📥 SW: Push recebido em segundo plano!");
  
  let data = { 
    title: 'Ousadia & Alegria', 
    body: 'Novidades na Pelada!', 
    url: '/', 
    soundPattern: 'single',
    tag: 'oa-notification-' + Date.now()
  };
  
  try {
    if (event.data) {
      const payload = event.data.json();
      console.log("📥 SW: Payload JSON:", payload);
      
      data = {
        title: payload.notification?.title || payload.title || data.title,
        body: payload.notification?.body || payload.body || data.body,
        url: payload.data?.url || payload.url || '/',
        soundPattern: payload.soundPattern || payload.data?.soundPattern || 'single',
        tag: payload.tag || ('oa-notification-' + Date.now())
      };
    }
  } catch (e) {
    console.log("📥 SW: Payload texto:", event.data ? event.data.text() : 'sem dados');
    data.body = event.data ? event.data.text() : data.body;
  }

  const soundPattern = data.soundPattern || 'single';
  const vibratePattern = soundPattern === 'triple'
    ? [200, 100, 200, 100, 450]
    : soundPattern === 'double'
      ? [200, 100, 250]
      : soundPattern === 'start'
        ? [500]
        : [200, 100, 200];

  const options = {
    body: data.body,
    icon: '/pwa-192x192.png?v=21',
    badge: '/pwa-192x192.png?v=21',
    vibrate: vibratePattern,
    tag: data.tag,
    renotify: true,
    requireInteraction: true,
    data: { 
      url: data.url || '/',
      soundPattern: data.soundPattern
    }
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Handler nativo do Firebase para background
messaging.onBackgroundMessage((payload) => {
  console.log('📥 [sw] Notificação em background via Firebase:', payload);
  
  // O Firebase já mostra a notificação se houver o campo 'notification' no payload
  // Mas podemos customizar aqui se necessário
});

self.addEventListener('notificationclick', (event) => {
  console.log("🖱️ SW: Notificação clicada!");
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Se já houver uma aba aberta, foca nela
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não, abre uma nova
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

