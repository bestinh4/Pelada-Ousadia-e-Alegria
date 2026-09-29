
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

const ICON_ASSET_VERSION = 'v20';

async function forceRefreshAppIconsAndManifest() {
  try {
    // Atualiza dinamicamente as tags <link> no DOM para forçar o navegador/WebAPK a detectar o novo ícone e manifest
    const head = document.head;
    if (head) {
      const manifestLink = head.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
      if (manifestLink) manifestLink.href = `/manifest.json?v=20`;

      const appleIcon = head.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
      if (appleIcon) appleIcon.href = `/apple-touch-icon.png?v=20`;

      const iconLinks = head.querySelectorAll('link[rel="icon"]');
      iconLinks.forEach((link) => {
        const el = link as HTMLLinkElement;
        if (el.sizes?.value === '192x192') {
          el.href = `/pwa-192x192.png?v=20`;
        } else {
          el.href = `/favicon.png?v=20`;
        }
      });
    }

    const lastSyncedVersion = localStorage.getItem('oa_icon_asset_version');
    if (lastSyncedVersion !== ICON_ASSET_VERSION) {
      const urlsToRefresh = [
        '/manifest.json',
        '/manifest.json?v=20',
        '/pwa-192x192.png',
        '/pwa-192x192.png?v=20',
        '/pwa-512x512.png',
        '/pwa-512x512.png?v=20',
        '/pwa-maskable-192x192.png?v=20',
        '/pwa-maskable-512x512.png?v=20',
        '/apple-touch-icon.png',
        '/apple-touch-icon.png?v=20',
        '/favicon.png',
        '/favicon.png?v=20',
        '/images/ousadia_alegria_crest.png',
        '/images/ousadia_alegria_crest.png?v=20',
      ];
      await Promise.allSettled(
        urlsToRefresh.map((u) => fetch(u, { cache: 'reload' }))
      );
      localStorage.setItem('oa_icon_asset_version', ICON_ASSET_VERSION);
    }
  } catch {}
}

// Registro do Service Worker para Notificações e atualização automática de ícones/caches sem reinstalar
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await forceRefreshAppIconsAndManifest();
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      });
      registration.update().catch(() => {});
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          registration.update().catch(() => {});
          forceRefreshAppIconsAndManifest();
        }
      });
    } catch (err) {
      console.error('Falha ao registrar SW:', err);
    }
  });
} else {
  window.addEventListener('load', () => {
    forceRefreshAppIconsAndManifest();
  });
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.error('Erro capturado pelo RootErrorBoundary:', error);
    try {
      localStorage.removeItem('oa_real_players_cache');
      localStorage.removeItem('oa_real_match_cache');
      localStorage.removeItem('oa_real_session_cache');
      localStorage.removeItem('oa_real_finance_cache');
      localStorage.removeItem('oa_real_expenses_cache');
      localStorage.removeItem('oa_current_page');
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary-container/10 text-primary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">refresh</span>
          </div>
          <h2 className="font-headline-sm text-lg font-bold text-navy-deep">
            Sincronizando dados atualizados...
          </h2>
          <p className="text-xs text-outline max-w-xs">
            O cache local foi atualizado. Toque abaixo para recarregar o aplicativo.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-3 bg-primary-container text-white rounded-xl font-bold text-xs shadow-md active:scale-95 transition-all"
          >
            RECARREGAR APLICATIVO
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);

