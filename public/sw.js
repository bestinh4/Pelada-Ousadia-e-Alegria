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

const CACHE_NAME = 'oa-elite-pro-v8'; // Incrementado para v8
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  console.log("📥 SW: Instalando...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log("🚀 SW: Ativado!");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("🗑️ SW: Removendo cache antigo:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
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
  console.log("📥 SW: Push recebido!");
  
  // Se o Firebase Messaging estiver ativo, ele pode lidar com a notificação
  // Mas mantemos este listener para garantir redundância ou lidar com data messages
  let data = { title: 'Ousadia & Alegria', body: 'Novidades na Arena!' };
  
  try {
    if (event.data) {
      const payload = event.data.json();
      console.log("📥 SW: Payload JSON:", payload);
      
      // FCM pode enviar no formato { notification: { title, body }, data: { url } }
      // ou direto no root se for data message
      data = {
        title: payload.notification?.title || payload.title || data.title,
        body: payload.notification?.body || payload.body || data.body,
        url: payload.data?.url || payload.url || '/'
      };
    }
  } catch (e) {
    console.log("📥 SW: Payload texto:", event.data ? event.data.text() : 'sem dados');
    data.body = event.data ? event.data.text() : data.body;
  }

  const options = {
    body: data.body,
    icon: 'https://images.weserv.nl/?url=https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png&w=192&h=192&fit=contain&padding=10',
    badge: 'https://images.weserv.nl/?url=https://i.postimg.cc/QCGV109g/Gemini-Generated-Image-xrrv8axrrv8axrrv-removebg-preview.png&w=96&h=96&fit=contain',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'oa-notification',
    renotify: true,
    data: { url: data.url || '/' }
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

self.addEventListener('fetch', (event) => {
  // Ignorar requisições que não sejam GET ou que não sejam http/https
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);
      
      if (cachedResponse) return cachedResponse;
      
      // Fallback para navegação (SPA)
      if (event.request.mode === 'navigate') {
        const indexFallback = await cache.match('/index.html');
        if (indexFallback) return indexFallback;
      }
      
      // Retorna uma resposta de erro amigável em vez de undefined
      return new Response('Recurso não disponível offline', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'Content-Type': 'text/plain' })
      });
    })
  );
});
