import { playWhistleSound, WhistlePattern } from '../utils/sound.ts';

export interface BackgroundDiagnostics {
  permission: NotificationPermission | 'unsupported';
  hasServiceWorker: boolean;
  hasPushSubscription: boolean;
  isStandalonePWA: boolean;
  periodicSyncSupported: boolean;
  persistentStorage: boolean;
  isIOS: boolean;
  isAndroid: boolean;
}

const HEARTBEAT_WORKER_CODE = `
  let timer = null;
  self.onmessage = function(e) {
    if (e.data === 'start') {
      if (timer) clearInterval(timer);
      timer = setInterval(function() {
        self.postMessage({ type: 'tick', at: Date.now() });
      }, 25000);
    } else if (e.data === 'stop') {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
`;

export function startBackgroundKeepAlive(onSyncNeeded: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let worker: Worker | null = null;
  let workerUrl: string | null = null;

  const pingServiceWorker = async () => {
    try {
      if (!('serviceWorker' in navigator)) return;
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage({ type: 'KEEP_ALIVE_PING', at: Date.now() });
      }
    } catch {}
  };

  // 1. Solicitar armazenamento persistente para evitar que o SO descarte o Service Worker e inscrições
  if (navigator.storage && typeof navigator.storage.persist === 'function') {
    navigator.storage.persisted?.().then((already) => {
      if (!already) {
        navigator.storage.persist().catch(() => {});
      }
    }).catch(() => {});
  }

  // 2. Registrar Periodic Background Sync e Background Sync quando suportado
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then(async (reg: any) => {
        try {
          if (reg.periodicSync && typeof reg.periodicSync.register === 'function') {
            await reg.periodicSync.register('oa-notif-sync', {
              minInterval: 15 * 60 * 1000,
            });
          }
        } catch {}

        try {
          if (reg.sync && typeof reg.sync.register === 'function') {
            await reg.sync.register('oa-bg-sync');
          }
        } catch {}
      })
      .catch(() => {});
  }

  // 3. Dedicated Web Worker Heartbeat (sofre menos throttling em abas minimizadas)
  try {
    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
      const blob = new Blob([HEARTBEAT_WORKER_CODE], { type: 'application/javascript' });
      workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
      worker.onmessage = () => {
        pingServiceWorker();
      };
      worker.postMessage('start');
    }
  } catch {}

  // 4. Sincronizar imediatamente ao retornar, ganhar foco ou reconectar rede
  const handleWakeUp = () => {
    if (document.visibilityState === 'visible') {
      try {
        (navigator as any).clearAppBadge?.().catch?.(() => {});
        navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_BADGE' });
      } catch {}
      onSyncNeeded();
    }
  };

  const handleOnline = () => {
    pingServiceWorker();
    onSyncNeeded();
  };

  // 5. Ouvir mensagens vindas do Service Worker (renovação automática de chave Push ou som de apito)
  const handleSwMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'PUSH_SUBSCRIPTION_UPDATED' || data.type === 'SYNC_PUSH_SUBSCRIPTION') {
      onSyncNeeded();
    } else if (data.type === 'PUSH_RECEIVED' && data.soundPattern) {
      try {
        playWhistleSound(data.soundPattern as WhistlePattern);
      } catch {}
    }
  };

  document.addEventListener('visibilitychange', handleWakeUp);
  window.addEventListener('focus', handleWakeUp);
  window.addEventListener('pageshow', handleWakeUp);
  window.addEventListener('online', handleOnline);
  navigator.serviceWorker?.addEventListener?.('message', handleSwMessage);

  return () => {
    document.removeEventListener('visibilitychange', handleWakeUp);
    window.removeEventListener('focus', handleWakeUp);
    window.removeEventListener('pageshow', handleWakeUp);
    window.removeEventListener('online', handleOnline);
    navigator.serviceWorker?.removeEventListener?.('message', handleSwMessage);
    if (worker) {
      worker.postMessage('stop');
      worker.terminate();
    }
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl);
    }
  };
}

export async function getBackgroundDiagnostics(): Promise<BackgroundDiagnostics> {
  const ua = typeof window !== 'undefined' ? window.navigator.userAgent.toLowerCase() : '';
  const isIOS = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
  const isAndroid = /android/.test(ua);
  const isStandalonePWA =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://'));

  const permission =
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported';

  let hasServiceWorker = false;
  let hasPushSubscription = false;
  let periodicSyncSupported = false;
  let persistentStorage = false;

  try {
    if (navigator.storage && typeof navigator.storage.persisted === 'function') {
      persistentStorage = await navigator.storage.persisted();
    }
  } catch {}

  try {
    if ('serviceWorker' in navigator) {
      const reg: any = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      if (reg) {
        hasServiceWorker = Boolean(reg.active);
        periodicSyncSupported = Boolean(reg.periodicSync);
        const sub = await reg.pushManager?.getSubscription();
        hasPushSubscription = Boolean(sub && sub.endpoint);
      }
    }
  } catch {}

  return {
    permission,
    hasServiceWorker,
    hasPushSubscription,
    isStandalonePWA,
    periodicSyncSupported,
    persistentStorage,
    isIOS,
    isAndroid,
  };
}
